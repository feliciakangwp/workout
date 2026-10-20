import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { EstimateRow } from '../lib/analytics';
import { fmtTime } from '../lib/format';

export type Pace = 'best' | 'avg';

/** One leg of the race replay: a 1 km run or a station. */
interface Leg {
  kind: 'run' | 'station';
  index: number;
  sec: number;
}

/** Race order: run 1, station 1, run 2, … station 8. Roxzone time is spread across the legs. */
export function raceLegs(rows: EstimateRow[], roxzoneSec: number, pace: Pace): Leg[] {
  const extra = roxzoneSec / (rows.length * 2);
  return rows.flatMap((r, i) => [
    { kind: 'run' as const, index: i, sec: r.run[pace] + extra },
    { kind: 'station' as const, index: i, sec: r.station_[pace] + extra },
  ]);
}

const COLORS = { floor: 0xf8fafc, lane: 0x93c5fd, best: 0x2563eb, avg: 0xbfdbfe, start: 0x16a34a, runner: 0xf97316 };
/** Gap between average and best: small = green, medium = amber, large = red. */
const gapColor = (best: number, avg: number) => {
  const gap = (avg - best) / avg;
  return gap < 0.04 ? 0x22c55e : gap < 0.09 ? 0xf59e0b : 0xef4444;
};

/**
 * 3D race floor: start, eight stations around a loop with a 1 km run lane
 * before each, and pillars showing best (solid) and average (glass) station
 * times. `playing` replays the race with a runner and reports the race clock.
 */
export function Race3DScene({
  rows,
  roxzoneSec,
  pace,
  playing,
  playKey,
  onTick,
  onDone,
}: {
  rows: EstimateRow[];
  roxzoneSec: number;
  pace: Pace;
  playing: boolean;
  /** Changing it restarts the replay. */
  playKey: number;
  onTick: (raceSec: number, leg: Leg | null) => void;
  onDone: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const play = useRef({ playing, pace, startedAt: 0, elapsed: 0, onTick, onDone });
  play.current.onTick = onTick;
  play.current.onDone = onDone;

  // Start / pause / restart the replay without rebuilding the scene.
  useEffect(() => {
    const p = play.current;
    p.pace = pace;
    if (playing && !p.playing) p.startedAt = performance.now() - p.elapsed;
    if (!playing && p.playing) p.elapsed = performance.now() - p.startedAt;
    p.playing = playing;
  }, [playing, pace]);
  useEffect(() => {
    const p = play.current;
    p.elapsed = 0;
    p.startedAt = performance.now();
  }, [playKey]);

  useEffect(() => {
    const el = mount.current!;
    const width = () => el.clientWidth;
    const height = () => el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f7);
    const camera = new THREE.PerspectiveCamera(45, width() / height(), 0.1, 200);
    camera.position.set(0, 17, 23);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width(), height());
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width(), height());
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    el.appendChild(labels.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 8;
    controls.maxDistance = 45;
    controls.target.set(0, 1, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(8, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
    scene.add(sun);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(17, 64), new THREE.MeshStandardMaterial({ color: COLORS.floor }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const disposables: { dispose: () => void }[] = [floor.geometry, floor.material as THREE.Material];
    const label = (html: string, className: string, pos: THREE.Vector3) => {
      const div = document.createElement('div');
      div.className = className;
      div.innerHTML = html;
      const obj = new CSS2DObject(div);
      obj.position.copy(pos);
      scene.add(obj);
      return obj;
    };

    // Start, stations and finish around a loop (start and finish side by side at the front).
    const R = 11;
    const n = rows.length;
    const angleAt = (k: number) => Math.PI / 2 + ((k + 0.6) / (n + 0.2)) * Math.PI * 2;
    const at = (k: number) => new THREE.Vector3(Math.cos(angleAt(k)) * R, 0, Math.sin(angleAt(k)) * R);
    const start = new THREE.Vector3(-1.4, 0, R);
    const points = [start, ...rows.map((_, i) => at(i))];

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 32), new THREE.MeshStandardMaterial({ color: COLORS.start }));
    pad.position.copy(start);
    scene.add(pad);
    disposables.push(pad.geometry, pad.material as THREE.Material);
    label('<b>Start / Finish</b>', 'r3d-tag r3d-start', start.clone().setY(0.9));

    const maxAvg = Math.max(...rows.map((r) => r.station_.avg));
    const stationMeshes: THREE.Mesh[] = [];
    rows.forEach((r, i) => {
      const p = points[i + 1];
      const prev = points[i];
      // Run lane from the previous point to this station.
      const mid = prev.clone().lerp(p, 0.5).add(new THREE.Vector3(0, 0, 0)).multiplyScalar(1.12);
      const curve = new THREE.QuadraticBezierCurve3(prev.clone().setY(0.06), mid.setY(0.06), p.clone().setY(0.06));
      const lane = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.12, 8), new THREE.MeshStandardMaterial({ color: COLORS.lane }));
      scene.add(lane);
      disposables.push(lane.geometry, lane.material as THREE.Material);
      label(`Run ${i + 1}<br><b>${fmtTime(r.run.best)}</b> · ${fmtTime(r.run.avg)}`, 'r3d-tag r3d-run', curve.getPoint(0.5).setY(0.5));
      lane.userData.curve = curve;

      // Station base, average pillar (glass) and best pillar (solid).
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.25, 32), new THREE.MeshStandardMaterial({ color: gapColor(r.station_.best, r.station_.avg) }));
      base.position.copy(p).setY(0.125);
      base.receiveShadow = true;
      scene.add(base);
      stationMeshes.push(base);
      const hAvg = 1 + (r.station_.avg / maxAvg) * 6;
      const hBest = 1 + (r.station_.best / maxAvg) * 6;
      const avg = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, hAvg, 32), new THREE.MeshStandardMaterial({ color: COLORS.avg, transparent: true, opacity: 0.45 }));
      avg.position.copy(p).setY(0.25 + hAvg / 2);
      const best = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, hBest, 32), new THREE.MeshStandardMaterial({ color: COLORS.best }));
      best.position.copy(p).setY(0.25 + hBest / 2);
      best.castShadow = true;
      scene.add(avg, best);
      disposables.push(base.geometry, base.material as THREE.Material, avg.geometry, avg.material as THREE.Material, best.geometry, best.material as THREE.Material);
      label(
        `<span class="r3d-num">${i + 1}</span> <b>${r.name}</b>${r.assumed ? ' <i>target</i>' : ''}<br>Best <b>${fmtTime(r.station_.best)}</b> · Avg ${fmtTime(r.station_.avg)}`,
        'r3d-tag r3d-station',
        p.clone().setY(hAvg + 1.1),
      );
    });
    const lanes = scene.children.filter((c) => c.userData.curve) as THREE.Mesh[];

    // Runner for the replay.
    const runner = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 24), new THREE.MeshStandardMaterial({ color: COLORS.runner, emissive: 0x7c2d12, emissiveIntensity: 0.3 }));
    runner.castShadow = true;
    runner.position.copy(start).setY(0.45);
    scene.add(runner);
    disposables.push(runner.geometry, runner.material as THREE.Material);

    const REPLAY_MS = 45_000; // whole race replayed in 45 seconds
    let frame = 0;
    let lastTick = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const p = play.current;
      const legs = raceLegs(rows, roxzoneSec, p.pace);
      const total = legs.reduce((a, l) => a + l.sec, 0);
      if (p.playing) {
        const t = Math.min(1, (now - p.startedAt) / REPLAY_MS);
        let raceSec = t * total;
        let leg: Leg | null = null;
        for (const l of legs) {
          if (raceSec <= l.sec) {
            leg = l;
            break;
          }
          raceSec -= l.sec;
        }
        const f = leg ? raceSec / leg.sec : 1;
        if (leg?.kind === 'run') runner.position.copy((lanes[leg.index].userData.curve as THREE.Curve<THREE.Vector3>).getPoint(f)).setY(0.45);
        // At a station the runner works just inside it, towards the centre of the floor.
        else if (leg) runner.position.copy(points[leg.index + 1]).multiplyScalar(0.8).setY(0.6 + Math.abs(Math.sin(now / 180)) * 0.5);
        else runner.position.copy(start).setY(0.45);
        stationMeshes.forEach((m, i) => m.scale.setScalar(leg?.kind === 'station' && leg.index === i ? 1.15 : 1));
        if (now - lastTick > 100 || t === 1) {
          lastTick = now;
          p.onTick(t * total, leg);
        }
        if (t === 1) {
          p.playing = false;
          p.onDone();
        }
      }
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    const resize = () => {
      camera.aspect = width() / height();
      // Pull back on narrow screens so the whole loop fits.
      const narrow = camera.aspect < 0.9;
      camera.fov = narrow ? 60 : 45;
      if (narrow && camera.position.length() < 32) camera.position.set(0, 30, 26);
      camera.updateProjectionMatrix();
      renderer.setSize(width(), height());
      labels.setSize(width(), height());
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      el.innerHTML = '';
    };
  }, [rows, roxzoneSec]);

  return <div ref={mount} className="relative h-full w-full touch-none overflow-hidden" />;
}

/** True when the browser can draw WebGL. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
