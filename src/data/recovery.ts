import type { MuscleGroup } from './types';

export type RecoveryRegion = 'lower' | 'upper' | 'mobility' | 'walk';

export interface RecoveryInfo {
  name: string;
  region: RecoveryRegion;
  /** The app's muscle groups it stretches (adductors, hip flexors and forearms map to the nearest group, or none). */
  muscles: MuscleGroup[];
  /** Muscles in full, as shown to the athlete. */
  targets: string;
  how?: string;
  /** Hold time per side (or in total when not per side), or reps per side. */
  dose: { timeSec?: number; reps?: number; perSide: boolean; text: string };
  hyrox: string;
}

/**
 * HYROX recovery library: flexibility and mobility work. It can improve comfort and range of
 * motion, but stretching alone does not reliably prevent soreness or speed up muscle recovery.
 */
export const RECOVERY_EXERCISES: RecoveryInfo[] = [
  // Lower body: quads, hamstrings, glutes and calves
  { name: 'Standing Quad Stretch', region: 'lower', muscles: ['quadriceps'], targets: 'Quadriceps (rectus femoris, vastus muscles)', how: 'Stand on one leg and gently pull the opposite heel toward your glutes.', dose: { timeSec: 45, perSide: true, text: '30–45 s per side' }, hyrox: 'Running, lunges, sled push, wall balls' },
  { name: 'Seated Hamstring Stretch', region: 'lower', muscles: ['hamstrings'], targets: 'Hamstrings (biceps femoris, semitendinosus, semimembranosus)', how: 'Extend one leg and hinge forward from your hips while keeping your back neutral.', dose: { timeSec: 45, perSide: true, text: '30–45 s per side' }, hyrox: 'Running, sled pulls, rowing' },
  { name: 'Figure-Four Stretch', region: 'lower', muscles: ['glutes'], targets: 'Gluteus maximus, piriformis and deep hip rotators', how: 'Lie on your back, cross one ankle over the opposite knee and gently pull the supporting thigh toward your chest.', dose: { timeSec: 45, perSide: true, text: '30–45 s per side' }, hyrox: 'Running, sled push, lunges' },
  { name: 'Half-Kneeling Hip Flexor Stretch', region: 'lower', muscles: ['quadriceps'], targets: 'Iliopsoas, rectus femoris', how: 'Kneel with one leg forward, gently tuck your pelvis and shift forward without arching your lower back.', dose: { timeSec: 30, perSide: true, text: '30 s per side' }, hyrox: 'Running, lunges, burpee broad jumps' },
  { name: 'Wall Calf Stretch', region: 'lower', muscles: ['calves'], targets: 'Gastrocnemius (straight knee), soleus (bent knee)', how: 'Hands against a wall, rear heel grounded; alternate straight and slightly bent knee.', dose: { timeSec: 30, perSide: true, text: '30 s each variation per side' }, hyrox: 'Running, sled push, burpee broad jumps' },
  { name: 'Butterfly Stretch', region: 'lower', muscles: ['glutes'], targets: 'Hip adductors (adductor longus, brevis, magnus, gracilis)', how: 'Sit with the soles of your feet together and let your knees relax outward.', dose: { timeSec: 45, perSide: false, text: '30–45 s' }, hyrox: 'Lunges, wall balls, running stability' },
  // Upper body: shoulders, chest, back and arms
  { name: 'Cross-Body Shoulder Stretch', region: 'upper', muscles: ['shoulders'], targets: 'Posterior deltoid, posterior shoulder tissues', dose: { timeSec: 30, perSide: true, text: '30 s per side' }, hyrox: 'SkiErg, rowing, wall balls' },
  { name: 'Overhead Triceps Stretch', region: 'upper', muscles: ['triceps'], targets: 'Triceps brachii (especially long head)', dose: { timeSec: 30, perSide: true, text: '30 s per side' }, hyrox: 'Wall balls, sled push' },
  { name: 'Doorway Chest Stretch', region: 'upper', muscles: ['chest'], targets: 'Pectoralis major, pectoralis minor region', dose: { timeSec: 30, perSide: true, text: '30 s per side' }, hyrox: 'Sled push, burpees' },
  { name: "Child's Pose with Side Reach", region: 'upper', muscles: ['back'], targets: 'Latissimus dorsi, teres major, lateral trunk muscles', dose: { timeSec: 30, perSide: true, text: '30 s per side' }, hyrox: 'SkiErg, sled pull, rowing' },
  { name: 'Wrist Flexor and Extensor Stretch', region: 'upper', muscles: ['biceps'], targets: 'Forearm flexors and extensors', dose: { timeSec: 30, perSide: true, text: '20–30 s each direction per side' }, hyrox: "Farmer's carry, sled pull, rowing" },
  // Spine and full-body mobility
  { name: 'Cat-Cow Mobility', region: 'mobility', muscles: ['back', 'core'], targets: 'Spinal mobility, erector spinae and abdominal tissues', dose: { reps: 10, perSide: false, text: '8–12 slow cycles' }, hyrox: 'General back mobility after running, rowing and lifting' },
  { name: 'Open-Book Thoracic Rotation', region: 'mobility', muscles: ['back', 'chest'], targets: 'Thoracic spine, pectorals and trunk rotation', dose: { reps: 8, perSide: true, text: '8 per side' }, hyrox: 'SkiErg, rowing, wall balls' },
  { name: '90/90 Hip Switches', region: 'mobility', muscles: ['glutes'], targets: 'Hip internal/external rotation, glutes and deep hip rotators', dose: { reps: 10, perSide: false, text: '8–10 controlled switches' }, hyrox: 'Running, lunges, wall balls' },
  { name: 'Knee-to-Wall Ankle Mobility', region: 'mobility', muscles: ['calves'], targets: 'Ankle dorsiflexion, soleus and Achilles tendon region', dose: { reps: 10, perSide: true, text: '10 per side' }, hyrox: 'Running, squats, sled push' },
  // Circulation
  { name: 'Walking', region: 'walk', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'], targets: 'Easy outdoor or treadmill walk for circulation', dose: { timeSec: 15 * 60, perSide: false, text: '10–20 min, easy pace' }, hyrox: 'Light movement between hard sessions' },
];

export const RECOVERY_BY_NAME: Record<string, RecoveryInfo> = Object.fromEntries(RECOVERY_EXERCISES.map((r) => [r.name, r]));

export const RECOVERY_NOTE =
  'These are flexibility and mobility exercises. They can improve comfort and range of motion, but stretching alone does not reliably prevent muscle soreness or speed up muscle recovery.';
