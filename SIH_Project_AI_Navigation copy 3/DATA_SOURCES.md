# Project Data Sources & Scientific Integration

The Antarctic AI Navigation project utilizes a suite of verified, multi-agency datasets to power its routing, iceberg tracking, and environmental forecasting capabilities. The following authoritative data streams replace legacy or mocked single-source archives:

## 1. Sea-Ice Forecasting
**Source:** [NOAA/NSIDC Sea Ice Concentration CDR v6 & Near-Real-Time AMSR2](https://nsidc.org/data/g02202/versions/6)  
**Integration Purpose:** Provides the foundational daily spatial grids of sea-ice concentration. This is the primary input required to train the ConvLSTM model for dynamic 6h/24h/72h forecasting of ice boundaries.

## 2. Iceberg Tracking Baseline
**Source:** [BYU/NIC Consolidated Antarctic Iceberg Tracking Database](https://www.scp.byu.edu/iceberg/default.html)  
**Integration Purpose:** Offers decades of daily iceberg position and size data. This historical displacement data is essential for the iceberg trajectory model to compute baseline drift and velocity vectors.

## 3. Iceberg Detection & SAR
**Source:** [Copernicus Data Space (Sentinel-1 SAR)](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1)  
**Integration Purpose:** Supplies high-resolution, all-weather synthetic aperture radar imagery. This serves as the remote context layer to validate synthetic multi-sensor obstacle detections in the radar simulation.

## 4. Environmental Forcings
**Source:** [Copernicus Marine Data Store (CMEMS)](https://data.marine.copernicus.eu/products) & [ECMWF ERA5](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview)  
**Integration Purpose:** Provides crucial environmental features—such as ocean currents, wave height, surface wind, and temperature—needed for both the trajectory drift model and the dynamic risk cost grid.

## 5. Localized Operations
**Source:** [NCPOR National Polar Data Center (NPDC)](https://npdc.ncpor.res.in/npdc/homepage.action)  
**Integration Purpose:** Contains Indian-specific polar datasets. Utilizing this data allows the prototype to simulate realistic routing scenarios to India's Bharati and Maitri research bases, directly appealing to the problem statement sponsor.

## 6. Model Benchmarking
**Source:** [AI4Arctic / IceBench Dataset](https://data.dtu.dk/collections/AI4Arctic_Sea_Ice_Challenge_Dataset/6244065)  
**Integration Purpose:** A standardized deep learning dataset for sea-ice classification. It provides pre-processed SAR and passive microwave data, allowing rapid evaluation of the MVP's precision and F1 scores against established baselines.

---

*(Note: Data loaders for these sources are implemented as Python adapters in the `src/` directory, fetching NetCDF/GRIB and JSON telemetry to feed the PyTorch GRU model and A* maritime router).*
