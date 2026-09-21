// Ambient Polar Ice Field — fixed background canvas behind the whole app shell.
// Deliberately calm: sits behind a data-dense dashboard, so it stays barely-there.
// Loaded as a module; `three` + `three/addons/` resolve via the importmap in <head>.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'

const canvas = document.getElementById('ice-bg')
if (canvas) {
  try {
    const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches
    const hexToVec3 = (hex) => {
      const n = parseInt(hex.slice(1), 16)
      return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(innerWidth, innerHeight, false)

    const scene = new THREE.Scene()
    scene.background = null
    scene.fog = new THREE.Fog(0x04070c, 0, 15)

    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 80)
    camera.position.set(0, 0, 5)

    const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 }
    camera.layers.enable(LAYERS.TORUS_SCENE)
    camera.layers.enable(LAYERS.BLOOM_SCENE)
    camera.layers.enable(LAYERS.ENTIRE_SCENE)
    scene.add(camera)

    const renderScene = new RenderPass(scene, camera)

    const torusComposer = new EffectComposer(renderer)
    torusComposer.renderToScreen = false
    torusComposer.addPass(renderScene)
    torusComposer.addPass(new ShaderPass(GammaCorrectionShader))
    torusComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.16, 0.2, 0))
    torusComposer.addPass(new ShaderPass(CopyShader))

    const bloomComposer = new EffectComposer(renderer)
    bloomComposer.renderToScreen = false
    bloomComposer.addPass(renderScene)
    bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.55, 0))
    bloomComposer.addPass(new ShaderPass(GammaCorrectionShader))

    const finalComposer = new EffectComposer(renderer)
    finalComposer.addPass(renderScene)

    // ---- ice-crystal point field (low count — this is atmosphere, not a hero) ----
    const N = 1800, depth = 30
    const positions = new Float32Array(N * 3), palette = new Float32Array(N),
      bright = new Float32Array(N), scales = new Float32Array(N), phases = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const i3 = i * 3
      positions[i3] = (Math.random() - 0.5) * 24
      positions[i3 + 1] = (Math.random() - 0.5) * 16
      positions[i3 + 2] = (Math.random() - 0.5) * depth
      palette[i] = Math.floor(Math.random() * 3)
      bright[i] = 0.7 + Math.random() * 0.6
      scales[i] = 0.4 + Math.pow(Math.random(), 1.4) * 2.2
      phases[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('aPalette', new THREE.Float32BufferAttribute(palette, 1))
    geo.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1))
    geo.setAttribute('aScale', new THREE.Float32BufferAttribute(scales, 1))
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1))

    const uniforms = {
      uTime: { value: 0 }, uSize: { value: 34 }, uDrift: { value: 0 }, uDepth: { value: depth }, uTwinkle: { value: 1 },
      uCursor: { value: new THREE.Vector3() }, uRepelRadius: { value: 5 }, uRepelStrength: { value: 0.2 },
      uActivity: { value: 0 }, uOpacity: { value: 0 }, uBrightness: { value: 1.3 },
      uColorA: { value: hexToVec3('#eef3f7') }, uColorB: { value: hexToVec3('#3fd0e0') }, uColorC: { value: hexToVec3('#7fb8ff') },
    }
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
      vertexShader: `
        uniform float uTime; uniform float uSize; uniform float uDrift; uniform float uDepth; uniform float uTwinkle;
        uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;
        attribute float aScale; attribute float aPhase; attribute float aPalette; attribute float aBright;
        uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
        varying vec3 vColor; varying float vTwinkle;
        void main(){
          vec3 pos = position;
          pos.z = mod(pos.z + uDrift + (uDepth*0.5), uDepth) - (uDepth*0.5);
          float tw = sin(uTime*1.6 + aPhase*6.2831);
          vTwinkle = (1.0-uTwinkle) + uTwinkle*(0.55+0.45*tw);
          vec4 modelPosition = modelMatrix * vec4(pos,1.0);
          vec3 toParticle = modelPosition.xyz - uCursor;
          float dist = length(toParticle);
          float falloff = smoothstep(uRepelRadius, 0.0, dist);
          modelPosition.xyz += normalize(toParticle+vec3(0.0001))*falloff*uRepelStrength*uActivity;
          vec4 viewPosition = viewMatrix * modelPosition;
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = uSize * aScale;
          gl_PointSize *= (1.0 / -viewPosition.z);
          vec3 base = aPalette<0.5 ? uColorA : (aPalette<1.5 ? uColorB : uColorC);
          vColor = base * aBright;
        }`,
      fragmentShader: `
        uniform float uOpacity; uniform float uBrightness;
        varying vec3 vColor; varying float vTwinkle;
        void main(){
          vec2 uv = gl_PointCoord - 0.5; float d = length(uv);
          if(d>0.5) discard;
          float strength = pow(1.0 - d*2.0, 4.0);
          vec3 color = mix(vec3(0.0), vColor, strength);
          gl_FragColor = vec4(color*uBrightness, strength*uOpacity*vTwinkle);
        }`,
    })
    const group = new THREE.Group()
    const points = new THREE.Points(geo, material)
    points.layers.set(LAYERS.ENTIRE_SCENE)
    points.layers.enable(LAYERS.BLOOM_SCENE)
    group.add(points)
    scene.add(group)

    // ---- composite pass: faint brand-colored aurora corners + bg wash ----
    const finalPass = new ShaderPass({
      uniforms: {
        iTime: { value: 0 }, tDiffuse: { value: null }, torusTexture: { value: null }, bloomTexture: { value: null },
        haloTexture: { value: null },
        uBg: { value: hexToVec3('#04070c') }, uFlameA: { value: hexToVec3('#3fd0e0') },
        uFlameB: { value: hexToVec3('#7fb8ff') }, uFlameAmt: { value: 0.1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,1.0); }`,
      fragmentShader: `
        uniform float iTime; uniform sampler2D tDiffuse; uniform sampler2D bloomTexture;
        uniform sampler2D torusTexture; uniform sampler2D haloTexture;
        uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
        varying vec2 vUv;
        vec3 warp3d(vec3 pos,float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
          pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
          pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
          pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
          return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
        void main(){
          vec2 uv = 2.*vUv - 1.;
          vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
          vec3 aurora = 1.5*uFlameA*w.x; aurora*=w.y; aurora += uFlameB*w.z;
          aurora *= smoothstep(0.25, 1., abs(uv.y));
          float md = smoothstep(-0.7, 1., -uv.y*uv.x); aurora *= md*md;
          vec3 bg = uBg * (1.0 - 0.35*length(uv));
          vec3 halo = vec3(0.0);
          float edgeA = clamp(0.10 + length(uv)*0.5, 0.0, 0.85);
          gl_FragColor = vec4(bg + aurora*uFlameAmt + texture2D(bloomTexture,vUv).xyz + texture2D(torusTexture,vUv).xyz + texture2D(tDiffuse,vUv).xyz + halo, edgeA);
        }`,
    })
    finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture
    finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture
    finalPass.renderToScreen = true
    finalComposer.addPass(finalPass)

    // ---- interaction: world-space pointer only (no scroll-drive — app shell) ----
    const POINTER = { world: new THREE.Vector3(), activity: 0, active: false, lastMove: performance.now() }
    const ndc = { x: 0, y: 0 }
    addEventListener('mousemove', (e) => {
      ndc.x = (e.clientX / innerWidth) * 2 - 1
      ndc.y = -(e.clientY / innerHeight) * 2 + 1
      POINTER.active = true; POINTER.lastMove = performance.now()
    })
    document.addEventListener('mouseout', () => { POINTER.active = false })

    const DRIFT = 0.5, SPIN = 0.008, TARGET_OPACITY = 0.35
    let appearStart = performance.now(), t0 = performance.now()

    function frame() {
      const now = performance.now(), t = now / 1000, dt = Math.min(0.05, t - t0); t0 = t
      if (POINTER.active) {
        const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize()
        const tt = -camera.position.z / dir.z
        if (Number.isFinite(tt) && tt > 0 && Math.abs(dir.z) > 1e-4) {
          POINTER.world.lerp(camera.position.clone().add(dir.multiplyScalar(tt)), 0.12)
        }
      } else POINTER.world.lerp(new THREE.Vector3(0, 0, 0), 0.12)
      const idle = (now - POINTER.lastMove) / 1000
      POINTER.activity += (((POINTER.active && idle < 3) ? 1 : 0) - POINTER.activity) * 0.06
      uniforms.uCursor.value.copy(POINTER.world); uniforms.uActivity.value = POINTER.activity
      uniforms.uTime.value = t
      uniforms.uDrift.value += dt * DRIFT
      const fade = Math.min(1, Math.max(0, (now - appearStart - 300) / 1400))
      uniforms.uOpacity.value = fade * TARGET_OPACITY
      group.rotation.z += dt * SPIN
      finalPass.uniforms.iTime.value = t
      camera.layers.set(LAYERS.TORUS_SCENE); torusComposer.render()
      camera.layers.set(LAYERS.BLOOM_SCENE); bloomComposer.render()
      camera.layers.set(LAYERS.ENTIRE_SCENE); finalComposer.render()
    }
    function loop() { if (!REDUCE_MOTION) requestAnimationFrame(loop); frame() }
    loop()

    addEventListener('resize', () => {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setSize(innerWidth, innerHeight, false)
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
      ;[torusComposer, bloomComposer, finalComposer].forEach((c) => {
        c.setPixelRatio(Math.min(devicePixelRatio, 2)); c.setSize(innerWidth, innerHeight)
      })
    })
  } catch (err) {
    console.warn('[ice-bg] disabled:', err)
  }
}
