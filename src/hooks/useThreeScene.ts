import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function useThreeScene(containerRef: React.RefObject<HTMLDivElement | null>) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<MapControls | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number>(0);
  const frustumRef = useRef(200);
  const is3DRef = useRef(false);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141418);
    sceneRef.current = scene;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const aspect = width / height;
    const frustum = frustumRef.current;

    // 2D orthographic camera (default)
    const camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum, 0.1, 10000
    );
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3D perspective camera (for simulation)
    const perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
    perspCamera.position.set(150, -150, 200);
    perspCamera.lookAt(0, 0, 0);
    perspCameraRef.current = perspCamera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2D map controls — middle/right mouse always pan, Ctrl+left also pans
    const controls = new MapControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.zoomSpeed = 1.2;
    // Start with LEFT disabled so normal clicks go to selection/gizmo
    controls.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controlsRef.current = controls;

    // Swap LEFT to PAN right before MapControls sees the event when Ctrl is held
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button === 0) {
        if (e.ctrlKey || e.metaKey) {
          controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        } else {
          controls.mouseButtons.LEFT = -1 as THREE.MOUSE;
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDownCapture, { capture: true });

    // 3D orbit controls (for simulation)
    const orbitControls = new OrbitControls(perspCamera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.1;
    orbitControls.zoomSpeed = 1.2;
    orbitControls.enabled = false;
    orbitControlsRef.current = orbitControls;

    // Grid
    const gridHelper = new THREE.GridHelper(1000, 100, 0x2a2a30, 0x1f1f24);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    gridRef.current = gridHelper;

    // Axes
    const axesGroup = new THREE.Group();
    const axesSize = 50;
    const xGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(axesSize, 0, 0)
    ]);
    axesGroup.add(new THREE.Line(xGeom, new THREE.LineBasicMaterial({ color: 0xff4444 })));
    const yGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axesSize, 0)
    ]);
    axesGroup.add(new THREE.Line(yGeom, new THREE.LineBasicMaterial({ color: 0x44ff44 })));
    const zGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axesSize)
    ]);
    axesGroup.add(new THREE.Line(zGeom, new THREE.LineBasicMaterial({ color: 0x4488ff })));
    scene.add(axesGroup);
    axesRef.current = axesGroup;

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      if (is3DRef.current) {
        orbitControls.update();
        renderer.render(scene, perspCamera);
      } else {
        controls.update();
        renderer.render(scene, camera);
      }
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      const a = w / h;
      const f = frustumRef.current;
      camera.left = -f * a;
      camera.right = f * a;
      camera.top = f;
      camera.bottom = -f;
      camera.updateProjectionMatrix();
      perspCamera.aspect = a;
      perspCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(animationIdRef.current);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      controls.dispose();
      orbitControls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [containerRef]);

  const setMode3D = useCallback((enable: boolean, stockCenter?: { x: number; y: number; z: number }, stockSize?: number) => {
    is3DRef.current = enable;
    const controls = controlsRef.current;
    const orbitControls = orbitControlsRef.current;
    const grid = gridRef.current;
    if (!controls || !orbitControls) return;

    if (enable) {
      controls.enabled = false;
      orbitControls.enabled = true;
      // Position camera looking down at the stock face, with slight tilt to show 3D
      if (stockCenter && stockSize) {
        const dist = stockSize * 1.2;
        const perspCamera = perspCameraRef.current;
        if (perspCamera) {
          perspCamera.position.set(
            stockCenter.x,
            stockCenter.y - dist * 0.3,
            stockCenter.z + dist
          );
          perspCamera.near = 0.1;
          perspCamera.far = dist * 20;
          perspCamera.updateProjectionMatrix();
          orbitControls.target.set(stockCenter.x, stockCenter.y, stockCenter.z);
          orbitControls.update();
        }
      }
      // Rotate grid to XY ground plane for 3D view
      if (grid) {
        grid.rotation.x = 0;
        grid.position.z = 0;
      }
    } else {
      orbitControls.enabled = false;
      controls.enabled = true;
      // Restore grid to 2D orientation
      if (grid) {
        grid.rotation.x = Math.PI / 2;
        grid.position.z = 0;
      }
    }
  }, []);

  const fitToView = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    if (!camera || !controls || !renderer) return;

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    const padding = 1.2;
    const size = Math.max(dx, dy, 1) * padding;

    const canvas = renderer.domElement;
    const aspect = canvas.clientWidth / canvas.clientHeight;

    frustumRef.current = size / 2;
    camera.left = -size * aspect / 2;
    camera.right = size * aspect / 2;
    camera.top = size / 2;
    camera.bottom = -size / 2;
    camera.position.set(cx, cy, 100);
    camera.updateProjectionMatrix();
    controls.target.set(cx, cy, 0);
    controls.update();
  }, []);

  return { sceneRef, cameraRef, rendererRef, controlsRef, fitToView, setMode3D };
}
