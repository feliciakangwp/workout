import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { StationId } from '../data/types';
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

/** Gap between average and best: small = green, medium = amber, large = red. */
const gapColor = (best: number, avg: number) => {
  const gap = (avg - best) / avg;
  return gap < 0.04 ? 0x22c55e : gap < 0.09 ? 0xf59e0b : 0xef4444;
};

const ATHLETE = 0x334155;
const HIGHLIGHT = 0xf97316;

// ---------------------------------------------------------------------------
// Arena geometry: an oval running track around the outside, stations inside.
// ---------------------------------------------------------------------------
const STRAIGHT = 17; // half length of each straight
const TRACK_IN = 10.2;
const TRACK_OUT = 13.4;
const RUN_R = 11.8; // running line

function stadiumShape(r: number) {
  const s = new THREE.Shape();
  s.moveTo(-STRAIGHT, -r);
  s.lineTo(STRAIGHT, -r);
  s.absarc(STRAIGHT, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-STRAIGHT, r);
  s.absarc(-STRAIGHT, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

/** Point on the track at lap fraction u (0 = Roxzone exit, front straight centre; runs anticlockwise seen from above). */
function trackPoint(u: number, r = RUN_R) {
  const arc = Math.PI * r;
  const total = 4 * STRAIGHT + 2 * arc;
  let d = (((u % 1) + 1) % 1) * total;
  // Front straight (z = +r) from x = 0 towards +x.
  if (d < STRAIGHT) return new THREE.Vector3(d, 0, r);
  d -= STRAIGHT;
  if (d < arc) {
    const a = Math.PI / 2 - d / r;
    return new THREE.Vector3(STRAIGHT + Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  d -= arc;
  if (d < 2 * STRAIGHT) return new THREE.Vector3(STRAIGHT - d, 0, -r);
  d -= 2 * STRAIGHT;
  if (d < arc) {
    const a = -Math.PI / 2 - d / r;
    return new THREE.Vector3(-STRAIGHT + Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  d -= arc;
  return new THREE.Vector3(-STRAIGHT + d, 0, r);
}

// ---------------------------------------------------------------------------
// Low-poly athlete: hips, torso (leans), head, arms and legs on pivots.
// Facing +z in its own space.
// ---------------------------------------------------------------------------
interface Athlete {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  material: THREE.MeshStandardMaterial;
}

function makeAthlete(geo: Record<string, THREE.BufferGeometry>, color = ATHLETE): Athlete {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b493, roughness: 0.7 });
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, y: number) => {
    const o = new THREE.Mesh(g, m);
    o.position.y = y;
    o.castShadow = true;
    return o;
  };
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(mesh(geo.torso, material, 0.38), mesh(geo.head, skin, 0.92));
  const limb = (parent: THREE.Group, x: number, y: number, g: THREE.BufferGeometry, len: number, m: THREE.Material) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(mesh(g, m, -len / 2));
    parent.add(pivot);
    return pivot;
  };
  const armL = limb(torso, 0.3, 0.68, geo.arm, 0.72, skin);
  const armR = limb(torso, -0.3, 0.68, geo.arm, 0.72, skin);
  const legL = limb(hips, 0.12, 0, geo.leg, 0.92, material);
  const legR = limb(hips, -0.12, 0, geo.leg, 0.92, material);
  return { root, hips, torso, armL, armR, legL, legR, material };
}

/** Resets an athlete to standing before each frame's pose. */
function stand(a: Athlete) {
  a.hips.position.y = 0.95;
  a.torso.rotation.set(0, 0, 0);
  for (const l of [a.armL, a.armR, a.legL, a.legR]) l.rotation.set(0, 0, 0);
}

function runPose(a: Athlete, t: number, speed = 9) {
  stand(a);
  const s = Math.sin(t * speed);
  a.legL.rotation.x = s * 0.7;
  a.legR.rotation.x = -s * 0.7;
  a.armL.rotation.x = -s * 0.8;
  a.armR.rotation.x = s * 0.8;
  a.torso.rotation.x = 0.15;
  a.hips.position.y = 0.95 + Math.abs(Math.cos(t * speed)) * 0.08;
}

const pingPong = (t: number, period: number) => {
  const p = (t / period) % 2;
  return p < 1 ? p : 2 - p;
};
const ease = (x: number) => 0.5 - Math.cos(Math.min(1, Math.max(0, x)) * Math.PI) / 2;

/** A station zone: equipment, its athlete and the per-frame animation. */
interface Zone {
  athlete: Athlete;
  update: (t: number, dt: number) => void;
}

/** Builds each station's equipment and its looping movement (zone space: about 7 × 6, centred on 0). */
function buildZone(id: StationId, group: THREE.Group, geo: Record<string, THREE.BufferGeometry>, mats: Record<string, THREE.Material>): Zone {
  const a = makeAthlete(geo);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const unit = new THREE.Group(); // athlete plus anything that moves with them
  unit.add(a.root);
  group.add(unit);

  switch (id) {
    case 'skierg': {
      // Two machines side by side; the athlete works the nearer one.
      box(0.35, 2.4, 0.3, mats.machine, 0, 1.2, 0.9);
      box(0.35, 2.4, 0.3, mats.machine, 2.2, 1.2, 0.9);
      const handles = box(0.6, 0.08, 0.08, mats.accent, 0, 2, 0.6);
      return {
        athlete: a,
        update: (t) => {
          const c = ease((Math.sin(t * 4) + 1) / 2);
          stand(a);
          a.armL.rotation.x = a.armR.rotation.x = -Math.PI * 0.95 + c * Math.PI * 0.85;
          a.torso.rotation.x = c * 0.65;
          a.hips.position.y = 0.95 - c * 0.18;
          a.legL.rotation.x = a.legR.rotation.x = -c * 0.25;
          handles.position.y = 2.15 - c * 1.1;
        },
      };
    }
    case 'sledPush': {
      const sled = new THREE.Group();
      box(0.9, 0.35, 0.7, mats.machine, 0, 0.2, 0, sled);
      box(0.08, 1.1, 0.08, mats.accent, 0.3, 0.9, -0.25, sled);
      box(0.08, 1.1, 0.08, mats.accent, -0.3, 0.9, -0.25, sled);
      sled.position.z = 1.15;
      unit.add(sled);
      return {
        athlete: a,
        update: (t) => {
          const p = pingPong(t, 3.2);
          const dir = Math.floor(t / 3.2) % 2 === 0 ? 1 : -1;
          unit.position.x = -2.6 + p * 5.2 - dir * 0.6;
          unit.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          stand(a);
          const s = Math.sin(t * 7);
          a.torso.rotation.x = 0.95;
          a.hips.position.y = 0.85;
          a.armL.rotation.x = a.armR.rotation.x = -1.35;
          a.legL.rotation.x = 0.35 + s * 0.45;
          a.legR.rotation.x = 0.35 - s * 0.45;
        },
      };
    }
    case 'sledPull': {
      const sled = new THREE.Group();
      box(0.9, 0.35, 0.7, mats.machine, 0, 0.2, 0, sled);
      group.add(sled);
      unit.position.x = 2.8;
      unit.rotation.y = -Math.PI / 2;
      const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mats.rope as THREE.LineBasicMaterial);
      group.add(rope);
      return {
        athlete: a,
        update: (t) => {
          const p = (t % 4.5) / 4.5;
          sled.position.x = -2.8 + ease(p) * 4.6;
          stand(a);
          const s = Math.sin(t * 9);
          a.torso.rotation.x = -0.25;
          a.hips.position.y = 0.88;
          a.legL.rotation.x = -0.3;
          a.legR.rotation.x = 0.25;
          a.armL.rotation.x = -1.3 + s * 0.55;
          a.armR.rotation.x = -1.3 - s * 0.55;
          const pos = rope.geometry.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(0, 2.35, 1.15, 0);
          pos.setXYZ(1, sled.position.x + 0.45, 0.3, 0);
          pos.needsUpdate = true;
        },
      };
    }
    case 'burpeeBroadJump': {
      unit.rotation.y = Math.PI / 2;
      return {
        athlete: a,
        update: (t) => {
          const cycle = 1.7;
          const n = Math.floor(t / cycle);
          const p = (t % cycle) / cycle;
          stand(a);
          let x = (n % 5) * 1.15;
          if (p < 0.5) {
            // Down to the floor and back up.
            const d = Math.sin((p / 0.5) * Math.PI);
            a.torso.rotation.x = d * 1.35;
            a.hips.position.y = 0.95 - d * 0.6;
            a.legL.rotation.x = a.legR.rotation.x = -d * 0.2;
            a.armL.rotation.x = a.armR.rotation.x = -d * 1.35;
          } else {
            // Broad jump forward.
            const j = (p - 0.5) / 0.5;
            a.hips.position.y = 0.95 + Math.sin(j * Math.PI) * 0.6;
            a.armL.rotation.x = a.armR.rotation.x = -Math.sin(j * Math.PI) * 2.6;
            a.legL.rotation.x = a.legR.rotation.x = Math.sin(j * Math.PI) * 0.4;
            x += ease(j) * 1.15;
          }
          unit.position.x = -2.9 + x;
        },
      };
    }
    case 'rowing': {
      box(0.25, 0.12, 2.8, mats.machine, 0, 0.3, 0);
      box(0.25, 0.12, 2.8, mats.machine, 2.2, 0.3, 0);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 20), mats.accent);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.55, 1.45);
      group.add(wheel);
      return {
        athlete: a,
        update: (t, dt) => {
          const c = ease((Math.sin(t * 3.2) + 1) / 2); // 0 = catch, 1 = finish
          stand(a);
          unit.position.z = 0.45 - c * 0.95;
          a.hips.position.y = 0.48;
          a.legL.rotation.x = a.legR.rotation.x = -0.9 - c * 0.65;
          a.torso.rotation.x = 0.45 - c * 0.85;
          a.armL.rotation.x = a.armR.rotation.x = -1.55 + c * 0.75;
          wheel.rotation.x += dt * (2 + c * 6);
        },
      };
    }
    case 'farmersCarry': {
      const bell = (arm: THREE.Group) => {
        const b = new THREE.Mesh(geo.bell, mats.machine);
        b.position.y = -0.82;
        b.castShadow = true;
        arm.add(b);
      };
      bell(a.armL);
      bell(a.armR);
      return {
        athlete: a,
        update: (t) => {
          // Walk laps around the zone.
          const per = 9;
          const p = (t % per) / per;
          const w = 2.6;
          const h = 1.8;
          const side = Math.floor(p * 4);
          const f = (p * 4) % 1;
          const pts = [[-w, -h], [w, -h], [w, h], [-w, h]];
          const [x0, z0] = pts[side];
          const [x1, z1] = pts[(side + 1) % 4];
          unit.position.set(x0 + (x1 - x0) * f, 0, z0 + (z1 - z0) * f);
          unit.rotation.y = Math.atan2(x1 - x0, z1 - z0);
          stand(a);
          const s = Math.sin(t * 6);
          a.legL.rotation.x = s * 0.45;
          a.legR.rotation.x = -s * 0.45;
          a.armL.rotation.z = -0.12;
          a.armR.rotation.z = 0.12;
        },
      };
    }
    case 'sandbagLunges': {
      box(0.75, 0.3, 0.32, mats.bag, 0, 0.82, -0.12, a.torso);
      unit.rotation.y = Math.PI / 2;
      return {
        athlete: a,
        update: (t) => {
          const cycle = 1.5;
          const n = Math.floor(t / cycle);
          const p = (t % cycle) / cycle;
          const d = Math.sin(p * Math.PI);
          stand(a);
          const front = n % 2 === 0 ? a.legL : a.legR;
          const back = n % 2 === 0 ? a.legR : a.legL;
          front.rotation.x = -d * 0.9;
          back.rotation.x = d * 0.75;
          a.hips.position.y = 0.95 - d * 0.42;
          a.armL.rotation.x = a.armR.rotation.x = -2.7;
          a.armL.rotation.z = 0.35;
          a.armR.rotation.z = -0.35;
          unit.position.x = -2.8 + ((n % 8) + ease(p)) * 0.7;
        },
      };
    }
    case 'wallBalls': {
      box(2.4, 3.6, 0.15, mats.wall, 0, 1.8, 1.5);
      const target = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), mats.accent);
      target.position.set(0, 3.05, 1.4);
      group.add(target);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mats.ball);
      ball.castShadow = true;
      group.add(ball);
      return {
        athlete: a,
        update: (t) => {
          const p = (t % 1.6) / 1.6;
          stand(a);
          if (p < 0.4) {
            // Squat with the ball at the chest.
            const d = Math.sin((p / 0.4) * Math.PI * 0.5);
            a.hips.position.y = 0.95 - d * 0.45;
            a.torso.rotation.x = d * 0.35;
            a.legL.rotation.x = a.legR.rotation.x = -d * 0.7;
            a.armL.rotation.x = a.armR.rotation.x = -1.6;
            ball.position.set(0, a.hips.position.y + 0.55, 0.38);
          } else {
            // Drive up and throw to the target, then catch.
            const j = (p - 0.4) / 0.6;
            const up = Math.min(1, j * 4);
            a.hips.position.y = 0.5 + up * 0.45;
            a.armL.rotation.x = a.armR.rotation.x = -1.6 - Math.sin(Math.min(1, j * 2) * Math.PI) * 1.3;
            const fly = Math.sin(j * Math.PI);
            ball.position.set(0, 1.5 + fly * 1.6, 0.38 + fly * 0.85);
          }
        },
      };
    }
  }
}

/**
 * Live 3D HYROX arena: a running track around the outside and the eight
 * stations inside, each with an athlete doing the movement. Labels give the
 * best and average time per station and run; zone mats are coloured by the gap
 * between them. `playing` replays the race: an orange runner laps the track for
 * each 1 km run, then the station's athlete turns orange while it is worked.
 */
export function Race3DScene({
  rows,
  roxzoneSec,
  pace,
  playing,
  playKey,
  onTick,
  onDone,
  onError,
}: {
  rows: EstimateRow[];
  roxzoneSec: number;
  pace: Pace;
  playing: boolean;
  /** Changing it restarts the replay. */
  playKey: number;
  onTick: (raceSec: number, leg: Leg | null) => void;
  onDone: () => void;
  /** The 3D view couldn't start or was lost (e.g. the phone ran out of graphics memory). */
  onError: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const play = useRef({ playing, pace, roxzoneSec, startedAt: 0, elapsed: 0, onTick, onDone, onError });
  play.current.onTick = onTick;
  play.current.onError = onError;
  play.current.onDone = onDone;
  play.current.roxzoneSec = roxzoneSec;

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
    scene.background = new THREE.Color(0x111827);
    scene.fog = new THREE.Fog(0x111827, 60, 110);
    const camera = new THREE.PerspectiveCamera(45, width() / height(), 0.1, 300);
    camera.position.set(0, 19, 27);

    // Phones get a lighter setup: lower resolution and smaller shadow maps.
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !small, powerPreference: 'default' });
    } catch {
      onError();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      play.current.onError();
    });
    renderer.setSize(width(), height());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width(), height());
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    el.appendChild(labels.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 8;
    controls.maxDistance = 75;
    controls.target.set(0, 0, 0);

    // Arena lighting: soft fill plus a key light for shadows and coloured stage lights.
    scene.add(new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(10, 30, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -32, right: 32, top: 20, bottom: -20, far: 80 });
    scene.add(key);
    const stageA = new THREE.PointLight(0x3b82f6, 60, 40);
    stageA.position.set(-20, 10, -14);
    const stageB = new THREE.PointLight(0xef4444, 50, 40);
    stageB.position.set(20, 10, -14);
    scene.add(stageA, stageB);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(x: T) => {
      disposables.push(x);
      return x;
    };
    const geo = {
      torso: track(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10)),
      head: track(new THREE.SphereGeometry(0.15, 14, 10)),
      arm: track(new THREE.CapsuleGeometry(0.06, 0.6, 4, 8)),
      leg: track(new THREE.CapsuleGeometry(0.08, 0.76, 4, 8)),
      bell: track(new THREE.SphereGeometry(0.14, 12, 10)),
    };
    const mats = {
      machine: track(new THREE.MeshStandardMaterial({ color: 0x0b0f19, roughness: 0.4, metalness: 0.4 })),
      accent: track(new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.3 })),
      wall: track(new THREE.MeshStandardMaterial({ color: 0x1f2937 })),
      ball: track(new THREE.MeshStandardMaterial({ color: 0xfacc15 })),
      bag: track(new THREE.MeshStandardMaterial({ color: 0x4b5563 })),
      rope: track(new THREE.LineBasicMaterial({ color: 0xe2e8f0 })),
    };

    // Hall floor, track (dark with white lane lines) and infield.
    const hall = new THREE.Mesh(track(new THREE.PlaneGeometry(140, 100)), track(new THREE.MeshStandardMaterial({ color: 0x374151 })));
    hall.rotation.x = -Math.PI / 2;
    hall.position.y = -0.02;
    hall.receiveShadow = true;
    scene.add(hall);
    const trackShape = stadiumShape(TRACK_OUT);
    trackShape.holes.push(stadiumShape(TRACK_IN) as unknown as THREE.Path);
    const trackMesh = new THREE.Mesh(track(new THREE.ShapeGeometry(trackShape, 48)), track(new THREE.MeshStandardMaterial({ color: 0x1e2533 })));
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);
    const infield = new THREE.Mesh(track(new THREE.ShapeGeometry(stadiumShape(TRACK_IN), 48)), track(new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })));
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = 0.005;
    infield.receiveShadow = true;
    scene.add(infield);
    const laneMat = track(new THREE.LineBasicMaterial({ color: 0xffffff }));
    for (const r of [TRACK_IN + 0.08, RUN_R - 0.55, RUN_R + 0.55, TRACK_OUT - 0.08]) {
      const pts = Array.from({ length: 161 }, (_, i) => trackPoint(i / 160, r).setY(0.02));
      scene.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), laneMat));
    }
    // Barrier boards around the outside and the Roxzone gate on the front straight.
    const board = track(new THREE.MeshStandardMaterial({ color: 0x0b0f19 }));
    for (let i = 0; i < 64; i++) {
      const u = i / 64;
      if (Math.abs(u - 0) < 0.012 || Math.abs(u - 1) < 0.012) continue;
      const p = trackPoint(u, TRACK_OUT + 0.4);
      const q = trackPoint(u + 0.005, TRACK_OUT + 0.4);
      const b = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.7, 0.08)), board);
      b.position.copy(p).setY(0.35);
      b.lookAt(q.setY(0.35));
      b.rotateY(Math.PI / 2);
      scene.add(b);
    }
    const gateMat = track(new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.4 }));
    for (const x of [-1.3, 1.3]) {
      const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 2.6, 0.15)), gateMat);
      post.position.set(x, 1.3, TRACK_IN - 0.2);
      scene.add(post);
    }
    const beam = new THREE.Mesh(track(new THREE.BoxGeometry(2.75, 0.3, 0.15)), gateMat);
    beam.position.set(0, 2.6, TRACK_IN - 0.2);
    scene.add(beam);

    const label = (html: string, className: string, pos: THREE.Vector3) => {
      const div = document.createElement('div');
      div.className = className;
      div.innerHTML = html;
      const obj = new CSS2DObject(div);
      obj.position.copy(pos);
      scene.add(obj);
      return obj;
    };
    label('<b>Roxzone</b> · start / finish', 'r3d-tag r3d-start', new THREE.Vector3(0, 3.3, TRACK_IN - 0.2));

    // Stations inside the track: 1–4 along the back, 5–8 back along the front.
    const xs = [-12.6, -4.2, 4.2, 12.6];
    const zones: Zone[] = [];
    const zonePos: THREE.Vector3[] = [];
    const zoneMats: THREE.MeshStandardMaterial[] = [];
    rows.forEach((r, i) => {
      const pos = new THREE.Vector3(i < 4 ? xs[i] : xs[7 - i], 0, i < 4 ? -4.3 : 4.3);
      zonePos.push(pos);
      const g = new THREE.Group();
      g.position.copy(pos);
      // Face the equipment away from the default camera so it never hides the athlete.
      g.rotation.y = Math.PI;
      scene.add(g);
      const color = gapColor(r.station_.best, r.station_.avg);
      const edge = track(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      zoneMats.push(edge);
      const border = new THREE.Mesh(track(new THREE.BoxGeometry(7.6, 0.05, 6.2)), edge);
      border.position.y = 0.02;
      const mat = new THREE.Mesh(track(new THREE.BoxGeometry(7.2, 0.07, 5.8)), track(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 })));
      mat.position.y = 0.035;
      mat.receiveShadow = true;
      g.add(border, mat);
      zones.push(buildZone(r.station, g, geo, mats));
      label(
        `<span class="r3d-num">${i + 1}</span><span class="r3d-full"> <b>${r.name}</b>${r.assumed ? ' <i>target</i>' : ''}<br>Best <b>${fmtTime(r.station_.best)}</b> · Avg ${fmtTime(r.station_.avg)}</span><span class="r3d-short"> <b>${fmtTime(r.station_.best)}</b></span>`,
        'r3d-tag r3d-station',
        pos.clone().setY(4.2),
      );
      // Run splits around the outside of the track.
      label(`Run ${i + 1}<br><b>${fmtTime(r.run.best)}</b> · ${fmtTime(r.run.avg)}`, 'r3d-tag r3d-run', trackPoint((i + 0.5) / rows.length, TRACK_OUT + 1.6).setY(0.6));
    });

    // Other athletes running laps, and the replay runner.
    const pack = [0.08, 0.31, 0.55, 0.72, 0.9].map((u, i) => {
      const a = makeAthlete(geo, [0x1f2937, 0x475569, 0x0f766e, 0x334155, 0x7c3aed][i]);
      scene.add(a.root);
      return { a, u, speed: 0.012 + i * 0.0015, lane: RUN_R + (i % 2 ? 0.35 : -0.35) };
    });
    const runner = makeAthlete(geo, HIGHLIGHT);
    runner.root.visible = false;
    scene.add(runner.root);
    const runnerTag = label('<b>You</b>', 'r3d-tag r3d-you', new THREE.Vector3(0, 2.4, 0));
    runnerTag.visible = false;
    runner.root.add(runnerTag);
    runnerTag.position.set(0, 2.4, 0);

    const placeOnTrack = (a: Athlete, u: number, lane: number) => {
      const p = trackPoint(u, lane);
      const q = trackPoint(u + 0.002, lane);
      a.root.position.copy(p);
      a.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    };

    const REPLAY_MS = 60_000; // whole race replayed in a minute
    const clock = new THREE.Clock();
    let frame = 0;
    let lastTick = 0;
    let active = -1;
    const setActive = (i: number) => {
      if (i === active) return;
      if (active >= 0) {
        zones[active].athlete.material.color.setHex(ATHLETE);
        zoneMats[active].emissiveIntensity = 0.25;
      }
      active = i;
      if (i >= 0) {
        zones[i].athlete.material.color.setHex(HIGHLIGHT);
        zoneMats[i].emissiveIntensity = 0.9;
      }
    };

    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      zones.forEach((z) => z.update(t, dt));
      for (const r of pack) {
        r.u += r.speed * dt;
        placeOnTrack(r.a, r.u, r.lane);
        runPose(r.a, t + r.u * 40);
      }

      const p = play.current;
      if (p.playing) {
        const legs = raceLegs(rows, p.roxzoneSec, p.pace);
        const total = legs.reduce((a, l) => a + l.sec, 0);
        const f = Math.min(1, (now - p.startedAt) / REPLAY_MS);
        let raceSec = f * total;
        let leg: Leg | null = null;
        for (const l of legs) {
          if (raceSec <= l.sec) {
            leg = l;
            break;
          }
          raceSec -= l.sec;
        }
        if (leg?.kind === 'run') {
          // One lap of the track per 1 km run, leaving and returning through the Roxzone.
          runner.root.visible = true;
          runnerTag.visible = true;
          placeOnTrack(runner, raceSec / leg.sec, RUN_R);
          runPose(runner, t, 11);
          setActive(-1);
        } else {
          runner.root.visible = false;
          runnerTag.visible = false;
          setActive(leg ? leg.index : -1);
        }
        if (now - lastTick > 100 || f === 1) {
          lastTick = now;
          p.onTick(f * total, leg);
        }
        if (f === 1) {
          p.playing = false;
          setActive(-1);
          p.onDone();
        }
      } else if (p.elapsed === 0) {
        // Reset: nobody highlighted, replay runner off the track.
        runner.root.visible = false;
        runnerTag.visible = false;
        setActive(-1);
      }
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    const resize = () => {
      camera.aspect = width() / height();
      // Pull back on narrow screens so the whole arena fits.
      const narrow = camera.aspect < 0.9;
      camera.fov = narrow ? 62 : 42;
      // Portrait: look along the arena's long side so it runs top to bottom.
      if (narrow && camera.position.z > 0) camera.position.set(24, 64, 0.01);
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
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      el.innerHTML = '';
    };
  }, [rows]);

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
