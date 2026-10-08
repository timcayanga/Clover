import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** The official vector mark becomes four beveled objects, not a replacement logo. */
export async function mountCloverScene(
  host: HTMLElement,
  signal: AbortSignal,
  getProgress: () => number,
  onReady: () => void,
  onFailure: () => void,
) {
  const source = await fetch("/clover-mark.svg", { signal }).then((r) => {
    if (!r.ok) throw new Error("Clover mark unavailable");
    return r.text();
  });
  if (signal.aborted) return () => {};
  // SVGLoader needs shapes only. Color is supplied by the brand materials below.
  const svg = source.replace(/fill="url\(#[^)]+\)"/g, 'fill="#ffffff"');
  const paths = new SVGLoader().parse(svg).paths;
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(0, 0, 8.5);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, 0.04);
  scene.environment = environmentMap.texture;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb5fff0, 0.9);
  fill.position.set(4, -2, 2);
  scene.add(fill);
  const sculpture = new THREE.Group();
  const leaves: { mesh: THREE.Mesh; position: THREE.Vector3 }[] = [];
  const materials: THREE.MeshPhysicalMaterial[] = [];
  const geometries: THREE.ExtrudeGeometry[] = [];
  paths.forEach((path, i) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: i === 3 ? "#6ee7b7" : "#03a8c0",
      metalness: 0.12,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.7,
    });
    materials.push(material);
    SVGLoader.createShapes(path).forEach((shape) => {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 12,
        bevelEnabled: true,
        bevelThickness: 3,
        bevelSize: 2.4,
        bevelSegments: 5,
        curveSegments: 32,
        steps: 1,
      });
      // Flip both Y and Z to preserve triangle winding and outward normals.
      geometry.scale(0.025, -0.025, -0.025);
      geometry.translate(-1.55, 1.55, 0.15);
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(center);
      sculpture.add(mesh);
      leaves.push({ mesh, position: center });
      geometries.push(geometry);
    });
  });
  scene.add(sculpture);
  let frame = 0;
  let visible = true;
  let disposed = false;
  let ready = false;
  let progress = getProgress();
  let pointerX = 0;
  let pointerY = 0;
  let time = 0;
  let last = performance.now();
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const bounds = host.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.2;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.12;
  };
  const leave = () => {
    pointerX = 0;
    pointerY = 0;
  };
  const draw = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || signal.aborted) return;
    time += Math.min(now - last, 40) / 1000;
    last = now;
    progress += (getProgress() - progress) * 0.08;
    const spread = 0.28 * (1 - Math.min(progress * 2.2, 1));
    sculpture.rotation.set(
      0.12 + Math.sin(time * 0.5) * 0.035 + pointerY,
      -0.4 + progress * 0.72 + pointerX,
      -0.12 + progress * 0.15,
    );
    sculpture.position.y = Math.sin(time * 0.85) * 0.06;
    sculpture.scale.setScalar(1 - progress * 0.06);
    leaves.forEach(({ mesh, position }, i) => {
      mesh.position.set(
        position.x * (1 + spread),
        position.y * (1 + spread),
        Math.sin(i * 1.8 + time * 0.7) * spread * 0.4,
      );
      mesh.rotation.y = Math.sin(i * 1.8 + time * 0.45) * spread * 0.25;
    });
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady();
    }
    frame = requestAnimationFrame(draw);
  };
  const resume = () => {
    if (!frame && visible && !document.hidden && !disposed) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  };
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else resume();
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resume();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  const resizeObserver = new ResizeObserver(resize);
  const lost = (event: Event) => {
    event.preventDefault();
    cleanup();
    onFailure();
  };
  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", leave);
    canvas.removeEventListener("webglcontextlost", lost);
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    environmentMap.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  resize();
  observer.observe(host);
  resizeObserver.observe(host);
  host.addEventListener("pointermove", move, { passive: true });
  host.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", visibility);
  resume();
  return cleanup;
}
