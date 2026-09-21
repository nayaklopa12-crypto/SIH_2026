"""
Evaluation & Benchmarking Pipeline
===================================
Compares PyTorch GRU against Constant Velocity baseline across 24h and 48h horizons.
Computes MAE, RMSE, and spherical Haversine distance errors in kilometers and nautical miles.
Generates trajectory evaluation plots with confidence intervals and uncertainty cones.
"""

import os
import sys
import json
import argparse
import math
import numpy as np
import pandas as pd
import torch
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from typing import Dict, Tuple, List

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.features import create_train_val_test_datasets, FEATURE_COLS, TrajectoryDataPipeline, add_engineered_features
from src.baseline import ConstantVelocityBaseline
from src.train_gru import IcebergGRU, get_device
from src.preprocessing import haversine_distance


def compute_haversine_errors(
    pred_coords: np.ndarray,
    true_coords: np.ndarray,
    horizons: Tuple[int, ...] = (1, 2)
) -> Dict[str, Dict[str, float]]:
    """
    Computes MAE, RMSE, and Haversine Distance Errors (km and NM) per horizon.
    """
    results = {}
    N = len(pred_coords)

    for h_idx, h in enumerate(horizons):
        pred_lat = pred_coords[:, h_idx * 2]
        pred_lon = pred_coords[:, h_idx * 2 + 1]
        true_lat = true_coords[:, h_idx * 2]
        true_lon = true_coords[:, h_idx * 2 + 1]

        # Latitude / Longitude coordinate errors
        lat_mae = float(np.mean(np.abs(pred_lat - true_lat)))
        # Longitude delta considering periodic wrap-around
        lon_diff = np.abs(pred_lon - true_lon)
        lon_diff = np.where(lon_diff > 180.0, 360.0 - lon_diff, lon_diff)
        lon_mae = float(np.mean(lon_diff))

        coord_rmse = float(np.sqrt(np.mean((pred_lat - true_lat)**2 + lon_diff**2)))

        # Great-circle Haversine distance error for each trajectory point
        hav_errors_km = []
        for i in range(N):
            dist_km = haversine_distance(pred_lat[i], pred_lon[i], true_lat[i], true_lon[i])
            hav_errors_km.append(dist_km)

        hav_errors_km = np.array(hav_errors_km)
        mean_hav_km = float(np.mean(hav_errors_km))
        median_hav_km = float(np.median(hav_errors_km))
        p90_hav_km = float(np.percentile(hav_errors_km, 90))
        mean_hav_nm = float(mean_hav_km / 1.852)

        results[f"{h * 24}h"] = {
            "lat_mae_deg": round(lat_mae, 4),
            "lon_mae_deg": round(lon_mae, 4),
            "rmse_deg": round(coord_rmse, 4),
            "haversine_mean_km": round(mean_hav_km, 2),
            "haversine_median_km": round(median_hav_km, 2),
            "haversine_p90_km": round(p90_hav_km, 2),
            "haversine_mean_nm": round(mean_hav_nm, 2)
        }

    return results


def plot_trajectory_evaluations(
    test_df: pd.DataFrame,
    model: IcebergGRU,
    pipeline: TrajectoryDataPipeline,
    baseline: ConstantVelocityBaseline,
    device: torch.device,
    save_path: str = "artifacts/trajectory_evaluation.png",
    num_samples: int = 3
):
    """
    Plots historical trajectory, actual future points, and predicted trajectories
    with confidence ellipses/uncertainty cones for representative test icebergs.
    """
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    fig, axes = plt.subplots(1, num_samples, figsize=(18, 6), facecolor="#0B132B")

    test_icebergs = test_df["iceberg_id"].unique()
    selected_bergs = test_icebergs[:num_samples]

    for idx, berg_id in enumerate(selected_bergs):
        ax = axes[idx] if num_samples > 1 else axes
        ax.set_facecolor("#1C2541")

        berg_data = test_df[test_df["iceberg_id"] == berg_id].sort_values("timestamp").reset_index(drop=True)
        # Select an illustrative segment of 30 days
        sample_len = min(len(berg_data), 35)
        segment = berg_data.iloc[-sample_len:].reset_index(drop=True)

        history = segment.iloc[:-2]
        actual_future = segment.iloc[-2:]

        # Plot historical path
        ax.plot(
            history["lon"], history["lat"],
            color="#48CAE4", linewidth=2.0, marker="o", markersize=4,
            label="Observed Track (Past 30d)", alpha=0.9
        )
        # Current position marker
        curr_pt = history.iloc[-1]
        ax.scatter(
            [curr_pt["lon"]], [curr_pt["lat"]],
            color="#FFD166", s=120, edgecolors="white", linewidth=1.5,
            label="Current Position (t=0)", zorder=5
        )

        # Baseline prediction
        p_base_24 = baseline.predict_point(
            curr_pt["lat"], curr_pt["lon"], curr_pt["speed_km_day"], curr_pt["heading_deg"], 1.0
        )
        p_base_48 = baseline.predict_point(
            curr_pt["lat"], curr_pt["lon"], curr_pt["speed_km_day"], curr_pt["heading_deg"], 2.0
        )
        base_lats = [curr_pt["lat"], p_base_24[0], p_base_48[0]]
        base_lons = [curr_pt["lon"], p_base_24[1], p_base_48[1]]
        ax.plot(
            base_lons, base_lats,
            color="#F77F00", linestyle="--", linewidth=2.0, marker="^",
            label="Const. Velocity Baseline"
        )

        # GRU Model Prediction
        hist_enriched = add_engineered_features(history)
        if len(hist_enriched) >= pipeline.seq_len:
            seq_feat = hist_enriched[pipeline.feature_cols].iloc[-pipeline.seq_len:].values
            seq_scaled = pipeline.scaler.transform(seq_feat).reshape(1, pipeline.seq_len, -1)
            t_input = torch.tensor(seq_scaled, dtype=torch.float32).to(device)

            model.eval()
            with torch.no_grad():
                deltas = model(t_input).cpu().numpy()[0]

            gru_lat_24 = curr_pt["lat"] + deltas[0]
            gru_lon_24 = curr_pt["lon"] + deltas[1]
            gru_lat_48 = curr_pt["lat"] + deltas[2]
            gru_lon_48 = curr_pt["lon"] + deltas[3]

            gru_lats = [curr_pt["lat"], gru_lat_24, gru_lat_48]
            gru_lons = [curr_pt["lon"], gru_lon_24, gru_lon_48]

            ax.plot(
                gru_lons, gru_lats,
                color="#06D6A0", linewidth=2.5, marker="s", markersize=6,
                label="PyTorch GRU Forecast"
            )

            # Uncertainty circles / confidence buffer (growing with horizon)
            for h_idx, (lat_pred, lon_pred, radius_km) in enumerate([(gru_lat_24, gru_lon_24, 15.0), (gru_lat_48, gru_lon_48, 30.0)]):
                # Approximate 1 deg lat ~ 111 km
                r_deg = radius_km / 111.0
                circle = plt.Circle(
                    (lon_pred, lat_pred), r_deg,
                    color="#06D6A0", fill=True, alpha=0.15, linestyle=":"
                )
                ax.add_patch(circle)

        # Actual ground truth future points
        actual_lats = [curr_pt["lat"]] + actual_future["lat"].tolist()
        actual_lons = [curr_pt["lon"]] + actual_future["lon"].tolist()
        ax.plot(
            actual_lons, actual_lats,
            color="#EF476F", linewidth=2.5, marker="*", markersize=8,
            label="Actual Trajectory"
        )

        ax.set_title(f"Iceberg {berg_id} - Trajectory Forecast", color="#E0FBFC", fontsize=12, fontweight="bold", pad=10)
        ax.set_xlabel("Longitude (°E)", color="#A9D6E5", fontsize=10)
        ax.set_ylabel("Latitude (°S)", color="#A9D6E5", fontsize=10)
        ax.tick_params(colors="#A9D6E5")
        ax.grid(color="#3A506B", linestyle="--", alpha=0.5)

        for spine in ax.spines.values():
            spine.set_color("#3A506B")

        if idx == 0:
            ax.legend(facecolor="#0B132B", edgecolor="#3A506B", labelcolor="#E0FBFC", fontsize=9, loc="upper left")

    plt.suptitle("Antarctic AI Navigation - Trajectory Benchmarking (Actual vs Baseline vs GRU)", color="#FFFFFF", fontsize=14, fontweight="bold", y=0.98)
    plt.tight_layout()
    plt.savefig(save_path, dpi=100, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close()
    print(f"[PLOT] Trajectory evaluation visualization saved to: {save_path}")


def run_evaluation(
    csv_path: str = "data/processed/iceberg_tracks_clean.csv",
    model_path: str = "models/gru_iceberg.pt",
    scaler_path: str = "models/feature_scaler.pkl",
    metrics_save_path: str = "models/eval_metrics.json",
    plot_save_path: str = "artifacts/trajectory_evaluation.png"
) -> Dict:
    """
    Main evaluation pipeline comparing Baseline and GRU model.
    """
    device = get_device()
    print(f"[EVAL] Evaluating models on device: {device}")

    # Load checkpoint
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model checkpoint not found at {model_path}. Train the model first.")

    checkpoint = torch.load(model_path, map_location=device)
    feature_cols = checkpoint.get("feature_cols", FEATURE_COLS)
    seq_len = checkpoint.get("seq_len", 14)
    horizons = checkpoint.get("forecast_horizons", (1, 2))

    model = IcebergGRU(
        input_dim=len(feature_cols),
        hidden_dim=checkpoint.get("hidden_dim", 128),
        num_layers=checkpoint.get("num_layers", 2),
        output_dim=4
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    # Load Pipeline & Scaler
    pipeline = TrajectoryDataPipeline(seq_len=seq_len, forecast_horizons=horizons, feature_cols=feature_cols)
    pipeline.load_scaler(scaler_path)

    # Load test dataset
    df = pd.read_csv(csv_path)
    test_icebergs = checkpoint.get("test_icebergs", [])
    if not test_icebergs:
        all_bergs = df["iceberg_id"].unique()
        test_icebergs = all_bergs[int(len(all_bergs) * 0.85):]

    test_df = df[df["iceberg_id"].isin(test_icebergs)].reset_index(drop=True)
    print(f"[EVAL] Test set contains {len(test_icebergs)} icebergs, {len(test_df)} observations.")

    # Build test sequences
    X_test_raw, y_test_del, y_test_coords, base_test = pipeline.build_sequences(test_df)
    X_test_scaled = pipeline.transform(X_test_raw)

    print(f"[EVAL] Generated {len(X_test_scaled)} sliding evaluation windows.")

    # 1. Constant Velocity Baseline Inference
    baseline = ConstantVelocityBaseline()
    baseline_preds = baseline.predict_from_sequences(X_test_raw, base_test, horizons=horizons)
    baseline_metrics = compute_haversine_errors(baseline_preds, y_test_coords, horizons=horizons)

    # 2. PyTorch GRU Model Inference (batched to prevent CPU memory spikes)
    eval_batch_size = 256
    gru_deltas_list = []
    with torch.no_grad():
        for b_start in range(0, len(X_test_scaled), eval_batch_size):
            b_chunk = torch.tensor(X_test_scaled[b_start : b_start + eval_batch_size], dtype=torch.float32).to(device)
            d_out = model(b_chunk).cpu().numpy()
            gru_deltas_list.append(d_out)
    gru_deltas = np.vstack(gru_deltas_list)

    # Convert predicted deltas back to absolute lat/lon
    gru_preds = np.zeros_like(y_test_coords)
    for h_idx, h in enumerate(horizons):
        p_lat = base_test[:, 0] + gru_deltas[:, h_idx * 2]
        p_lon = base_test[:, 1] + gru_deltas[:, h_idx * 2 + 1]
        # Normalize longitude
        p_lon = (p_lon + 540.0) % 360.0 - 180.0
        gru_preds[:, h_idx * 2] = p_lat
        gru_preds[:, h_idx * 2 + 1] = p_lon

    gru_metrics = compute_haversine_errors(gru_preds, y_test_coords, horizons=horizons)

    # Compile Benchmark Summary
    summary = {
        "evaluation_dataset": "BYU/NIC Test Tracks",
        "num_test_sequences": len(X_test_scaled),
        "metrics": {
            "baseline_constant_velocity": baseline_metrics,
            "gru_neural_network": gru_metrics
        },
        "improvement_pct": {
            "24h_haversine_km": round(
                (baseline_metrics["24h"]["haversine_mean_km"] - gru_metrics["24h"]["haversine_mean_km"])
                / baseline_metrics["24h"]["haversine_mean_km"] * 100.0, 2
            ),
            "48h_haversine_km": round(
                (baseline_metrics["48h"]["haversine_mean_km"] - gru_metrics["48h"]["haversine_mean_km"])
                / baseline_metrics["48h"]["haversine_mean_km"] * 100.0, 2
            )
        }
    }

    print("\n" + "=" * 70)
    print("      ANTARCTIC NAVIGATION - MODEL BENCHMARK RESULTS")
    print("=" * 70)
    print(f"{'Metric':<30} | {'Baseline (CV)':<18} | {'PyTorch GRU':<18}")
    print("-" * 70)
    for h in ["24h", "48h"]:
        print(f"--- Horizon {h} ---")
        b = baseline_metrics[h]
        g = gru_metrics[h]
        print(f"  Haversine Mean Error (km)    | {b['haversine_mean_km']:<18} | {g['haversine_mean_km']:<18}")
        print(f"  Haversine Mean Error (NM)    | {b['haversine_mean_nm']:<18} | {g['haversine_mean_nm']:<18}")
        print(f"  Haversine Median Error (km)  | {b['haversine_median_km']:<18} | {g['haversine_median_km']:<18}")
        print(f"  Haversine 90th Pct Error (km)| {b['haversine_p90_km']:<18} | {g['haversine_p90_km']:<18}")
        print(f"  Lat MAE (deg)                | {b['lat_mae_deg']:<18} | {g['lat_mae_deg']:<18}")
        print(f"  Lon MAE (deg)                | {b['lon_mae_deg']:<18} | {g['lon_mae_deg']:<18}")
    print("-" * 70)
    print(f"GRU Haversine Error Reduction (+24h): {summary['improvement_pct']['24h_haversine_km']}%")
    print(f"GRU Haversine Error Reduction (+48h): {summary['improvement_pct']['48h_haversine_km']}%")
    print("=" * 70)

    # Save metrics JSON
    with open(metrics_save_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[SAVED] Benchmark metrics exported to {metrics_save_path}")

    # Clean up large memory buffers before plotting
    import gc
    del X_test_raw, X_test_scaled, baseline_preds, gru_preds, gru_deltas
    gc.collect()

    # Generate visual evaluation plots
    plot_trajectory_evaluations(
        test_df=test_df,
        model=model,
        pipeline=pipeline,
        baseline=baseline,
        device=device,
        save_path=plot_save_path
    )

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate Trajectory Forecasting Models")
    parser.add_argument("--csv_path", type=str, default="data/processed/iceberg_tracks_clean.csv")
    parser.add_argument("--model_path", type=str, default="models/gru_iceberg.pt")
    parser.add_argument("--scaler_path", type=str, default="models/feature_scaler.pkl")
    parser.add_argument("--metrics_save_path", type=str, default="models/eval_metrics.json")
    parser.add_argument("--plot_save_path", type=str, default="artifacts/trajectory_evaluation.png")
    args = parser.parse_args()

    run_evaluation(
        csv_path=args.csv_path,
        model_path=args.model_path,
        scaler_path=args.scaler_path,
        metrics_save_path=args.metrics_save_path,
        plot_save_path=args.plot_save_path
    )
