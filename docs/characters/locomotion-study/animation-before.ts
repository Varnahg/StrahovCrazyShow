import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AvatarRig } from "../../../client/avatar-renderer";
import type { Vec3 } from "../../../shared/types";

export type AvatarAnimationState = {
  /** Final interpolated render position; never a raw network snapshot. */
  position: Vec3;
  yaw: number;
  emote?: string;
  grounded?: boolean;
  vehicle?: boolean;
  teleport?: boolean;
  /** Optional terrain/step query. Without it use the current foot-level plane. */
  groundHeight?: (x: number, z: number) => number | undefined;
};
export type AvatarGait = "idle" | "walk" | "run" | "sprint";

const TAU = Math.PI * 2;
const blend = (rate: number, dt: number) => -Math.expm1(-rate * dt);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const shortestAngle = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

type FootContact = {
  planted: boolean;
  initialized: boolean;
  anchor: Vec3;
  target: Vec3;
  anchorYaw: number;
  settleFrom: Vec3;
  settleTime: number;
};
const footContact = (): FootContact => ({
  planted: false,
  initialized: false,
  anchor: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: 0 },
  anchorYaw: 0,
  settleFrom: { x: 0, y: 0, z: 0 },
  settleTime: Infinity,
});

/** Articulated, distance-driven gait. Root/camera/collider never bob or move here. */
export class AvatarAnimator {
  private initialized = false;
  private previousX = 0;
  private previousZ = 0;
  private wasDriving = false;
  private wasMoving = false;
  private measuredSpeed = 0;
  private movement = 0;
  private cycle = 0;
  private gesture = "";
  private gestureTime = 0;
  private gestureWeight = 0;
  private air = 0;
  private kneeQuaternion = Quaternion.Identity();
  private legQuaternion = Quaternion.Identity();
  private inverseLeg = Quaternion.Identity();
  private desiredFoot = Quaternion.Identity();
  readonly contacts = { left: footContact(), right: footContact() };

  constructor(private readonly rig: AvatarRig) {
    for (const joint of [rig.left, rig.right, rig.leftFoot, rig.rightFoot])
      joint.rotationQuaternion = Quaternion.Identity();
  }
  get speed() {
    return this.measuredSpeed;
  }
  get phase() {
    return this.cycle;
  }
  get gait(): AvatarGait {
    if (this.measuredSpeed < 0.12) return "idle";
    if (this.measuredSpeed < 2.8) return "walk";
    if (this.measuredSpeed < 5.8) return "run";
    return "sprint";
  }

  reset() {
    this.initialized = false;
    this.measuredSpeed = this.movement = this.cycle = this.air = 0;
    this.wasMoving = false;
    this.gesture = "";
    this.gestureTime = this.gestureWeight = 0;
    this.rig.hips.position.y = this.rig.measurements.hipHeight;
    for (const joint of [
      this.rig.left,
      this.rig.right,
      this.rig.leftKnee,
      this.rig.rightKnee,
      this.rig.leftFoot,
      this.rig.rightFoot,
      this.rig.arm,
      this.rig.rightArm,
      this.rig.leftElbow,
      this.rig.rightElbow,
      this.rig.torso,
      this.rig.head,
    ]) {
      joint.rotation.set(0, 0, 0);
      joint.rotationQuaternion?.set(0, 0, 0, 1);
    }
    for (const contact of Object.values(this.contacts)) {
      contact.initialized = contact.planted = false;
      contact.settleTime = Infinity;
    }
  }

  update(state: AvatarAnimationState, elapsedSeconds: number) {
    const { position, yaw } = state;
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0 ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      !Number.isFinite(yaw)
    )
      return;
    const dt = Math.min(elapsedSeconds, 0.1);
    let distance = this.initialized
      ? Math.hypot(position.x - this.previousX, position.z - this.previousZ)
      : 0;
    const driving = !!state.vehicle;
    if (
      state.teleport ||
      elapsedSeconds > 0.25 ||
      distance > 2.5 ||
      driving !== this.wasDriving
    ) {
      this.reset();
      distance = 0;
    }
    if (!this.initialized) {
      this.rig.root.rotation.y = yaw;
      this.initialized = true;
    }
    this.previousX = position.x;
    this.previousZ = position.z;
    this.wasDriving = driving;
    const speed = driving ? 0 : Math.min(9, distance / dt);
    this.measuredSpeed = mix(this.measuredSpeed, speed, blend(13, dt));
    if (this.measuredSpeed < 0.001) this.measuredSpeed = 0;
    const moving = this.measuredSpeed > 0.12 && !driving;
    this.movement = mix(this.movement, moving ? 1 : 0, blend(16, dt));
    const run = clamp((this.measuredSpeed - 2.4) / 2.2, 0, 1);
    const sprint = clamp((this.measuredSpeed - 5.8) / 1.2, 0, 1);
    const duty = mix(mix(0.52, 0.34, run), 0.28, sprint);
    const stride = 1 + Math.min(1.8, speed * 0.23);
    if (moving && !this.wasMoving) this.cycle = duty * 0.5 * TAU;
    if (!driving && distance > dt * 0.12 && state.grounded !== false)
      this.cycle =
        (this.cycle + (Math.min(distance, dt * 9) / stride) * TAU) % TAU;
    if (!moving && this.wasMoving) {
      for (const contact of Object.values(this.contacts)) {
        Object.assign(contact.settleFrom, contact.target);
        contact.settleTime = 0;
      }
    }
    this.wasMoving = moving;
    this.air = mix(
      this.air,
      state.grounded === false && !driving ? 1 : 0,
      blend(18, dt),
    );
    this.rig.root.rotation.y +=
      shortestAngle(this.rig.root.rotation.y, yaw) * blend(18, dt);
    // Let the support leg straighten at mid-stance. The previous constant
    // 8–10 cm lowering made every walking frame look like a crouch. Only the
    // visual pelvis follows reachable feet; root, camera and collider stay put.
    this.rig.hips.position.y = mix(
      this.rig.measurements.hipHeight,
      this.supportedHipHeight(state, duty, stride, run),
      this.movement,
    );
    this.rig.torso.rotation.x = mix(
      this.rig.torso.rotation.x,
      Math.min(0.1, this.measuredSpeed * 0.014) * this.movement,
      blend(14, dt),
    );
    this.rig.torso.rotation.y = mix(
      this.rig.torso.rotation.y,
      Math.sin(this.cycle) * 0.025 * this.movement,
      blend(18, dt),
    );
    this.rig.head.rotation.x = -this.rig.torso.rotation.x * 0.5;
    this.rig.head.rotation.y = -this.rig.torso.rotation.y * 0.5;
    this.poseFoot(
      this.contacts.left,
      this.rig.left,
      this.rig.leftKnee,
      this.rig.leftFoot,
      this.cycle / TAU,
      duty,
      stride,
      -1,
      state,
      moving,
      run,
      dt,
    );
    this.poseFoot(
      this.contacts.right,
      this.rig.right,
      this.rig.rightKnee,
      this.rig.rightFoot,
      (this.cycle / TAU + 0.5) % 1,
      duty,
      stride,
      1,
      state,
      moving,
      run,
      dt,
    );
    this.poseArms(state, dt, run, driving);
  }

  private supportedHipHeight(
    state: AvatarAnimationState,
    duty: number,
    stride: number,
    run: number,
  ) {
    const m = this.rig.measurements,
      scale = this.rig.root.scaling;
    const yaw = this.rig.root.rotation.y,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    let height = m.hipHeight - 0.006;
    for (let index = 0; index < 2; index++) {
      const phase = (this.cycle / TAU + (index ? 0.5 : 0)) % 1,
        side = index ? 1 : -1;
      const contact = index ? this.contacts.right : this.contacts.left;
      const reach = stride * duty * 0.5;
      let z = reach - stride * phase,
        lift = 0;
      if (phase >= duty) {
        const progress = (phase - duty) / (1 - duty),
          tangent = -stride * (1 - duty);
        z =
          mix(-reach, reach, smooth(progress)) +
          tangent * (2 * progress ** 3 - 3 * progress ** 2 + progress);
        lift = Math.sin(Math.PI * progress) ** 2 * mix(0.08, 0.16, run);
      }
      const lateral = side * m.legSpacing;
      let x = state.position.x + c * lateral * scale.x + s * z * scale.z;
      let worldZ = state.position.z - s * lateral * scale.x + c * z * scale.z;
      if (phase < duty && contact.planted && contact.initialized) {
        x = contact.anchor.x;
        worldZ = contact.anchor.z;
      }
      const dx = x - state.position.x,
        dz = worldZ - state.position.z;
      const localX = (c * dx - s * dz) / scale.x - lateral,
        localZ = (s * dx + c * dz) / scale.z;
      const floor = state.groundHeight?.(x, worldZ) ?? state.position.y;
      const footY = (floor - state.position.y) / scale.y + m.ankleHeight + lift;
      const length = m.thigh + m.shin - 0.0005;
      height = Math.min(
        height,
        footY +
          Math.sqrt(
            Math.max(0, length * length - localX * localX - localZ * localZ),
          ) -
          0.006,
      );
    }
    return clamp(height, m.hipHeight - 0.19, m.hipHeight);
  }

  private poseFoot(
    contact: FootContact,
    hip: TransformNode,
    knee: TransformNode,
    foot: TransformNode,
    phase: number,
    duty: number,
    stride: number,
    side: number,
    state: AvatarAnimationState,
    moving: boolean,
    run: number,
    dt: number,
  ) {
    const m = this.rig.measurements;
    const root = state.position,
      yaw = this.rig.root.rotation.y;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const scale = this.rig.root.scaling;
    const lateral = side * m.legSpacing;
    const reach = stride * duty * 0.5;
    const groundAt = (x: number, z: number) =>
      state.groundHeight?.(x, z) ?? root.y;
    let localX = lateral,
      localY = m.ankleHeight,
      localZ = 0,
      toe = 0,
      footYaw = yaw;
    const stance = phase < duty;
    if (!contact.initialized) {
      contact.initialized = true;
      contact.anchor.x = root.x + c * lateral * scale.x;
      contact.anchor.z = root.z - s * lateral * scale.x;
      contact.anchor.y =
        groundAt(contact.anchor.x, contact.anchor.z) + m.ankleHeight * scale.y;
      contact.anchorYaw = yaw;
      contact.planted = true;
      Object.assign(contact.target, contact.anchor);
    }
    if (moving && this.air < 0.5) {
      if (stance) {
        if (!contact.planted) {
          // The render frame can land slightly after phase zero. Account for
          // that travelled distance instead of snapping forward by one frame.
          const landing = reach - stride * phase;
          contact.anchor.x =
            root.x + c * lateral * scale.x + s * landing * scale.z;
          contact.anchor.z =
            root.z - s * lateral * scale.x + c * landing * scale.z;
          contact.anchor.y =
            groundAt(contact.anchor.x, contact.anchor.z) +
            m.ankleHeight * scale.y;
          contact.anchorYaw = yaw;
        }
        contact.planted = true;
        Object.assign(contact.target, contact.anchor);
        footYaw = contact.anchorYaw;
        toe = 0;
      } else {
        contact.planted = false;
        const progress = (phase - duty) / (1 - duty);
        // Match -body velocity at both ends, so the shoe's world velocity is
        // zero at toe-off/landing, rather than abruptly parking a moving foot.
        const tangent = -stride * (1 - duty);
        localZ =
          mix(-reach, reach, smooth(progress)) +
          tangent * (2 * progress ** 3 - 3 * progress ** 2 + progress);
        localY += Math.sin(Math.PI * progress) ** 2 * mix(0.08, 0.16, run);
        toe = Math.sin(Math.PI * 2 * progress) * 0.18;
        contact.target.x =
          root.x + c * lateral * scale.x + s * localZ * scale.z;
        contact.target.z =
          root.z - s * lateral * scale.x + c * localZ * scale.z;
        contact.target.y =
          groundAt(contact.target.x, contact.target.z) + localY * scale.y;
      }
    } else if (this.air < 0.5) {
      // A brief staggered settling step, rather than dragging a planted foot
      // along the floor when the player releases movement.
      const destinationX = root.x + c * lateral * scale.x;
      const destinationZ = root.z - s * lateral * scale.x;
      const progress = Number.isFinite(contact.settleTime)
        ? clamp((contact.settleTime - (side > 0 ? 0.1 : 0)) / 0.22, 0, 1)
        : 1;
      contact.settleTime += dt;
      contact.target.x = mix(
        contact.settleFrom.x,
        destinationX,
        smooth(progress),
      );
      contact.target.z = mix(
        contact.settleFrom.z,
        destinationZ,
        smooth(progress),
      );
      const floor = groundAt(contact.target.x, contact.target.z);
      contact.target.y =
        floor +
        (m.ankleHeight + Math.sin(Math.PI * progress) * 0.055) * scale.y;
      contact.planted = progress === 0 || progress === 1;
      if (progress === 1) {
        Object.assign(contact.anchor, contact.target);
        contact.anchorYaw = yaw;
      }
    }
    const dx = contact.target.x - root.x,
      dz = contact.target.z - root.z;
    localX = (c * dx - s * dz) / scale.x;
    localZ = (s * dx + c * dz) / scale.z;
    localY = (contact.target.y - root.y) / scale.y;
    // Airborne leg fold blends independently of the ground-contact state.
    localX = mix(localX, lateral, this.air);
    localY = mix(localY, m.ankleHeight + (side < 0 ? 0.2 : 0.14), this.air);
    localZ = mix(localZ, side < 0 ? 0.11 : -0.09, this.air);
    if (this.air > 0.5) contact.planted = false;
    const vx = localX - lateral,
      vy = localY - this.rig.hips.position.y,
      vz = localZ;
    const planarY = -Math.hypot(vx, vy);
    const length = clamp(
      Math.hypot(vx, vy, vz),
      Math.abs(m.thigh - m.shin) + 0.001,
      m.thigh + m.shin - 0.0001,
    );
    const bend = Math.acos(
      clamp(
        (m.thigh * m.thigh + length * length - m.shin * m.shin) /
          (2 * m.thigh * length),
        -1,
        1,
      ),
    );
    const hipAngle = Math.atan2(-vz, -planarY) - bend;
    const kneeAngle =
      Math.PI -
      Math.acos(
        clamp(
          (m.thigh * m.thigh + m.shin * m.shin - length * length) /
            (2 * m.thigh * m.shin),
          -1,
          1,
        ),
      );
    const roll = Math.atan2(vx, -vy);
    hip.rotation.set(hipAngle, 0, roll);
    // Rz * Rx preserves the sagittal knee plane even during a planted turn.
    const hx = Math.sin(hipAngle / 2),
      hw = Math.cos(hipAngle / 2);
    const rz = Math.sin(roll / 2),
      rw = Math.cos(roll / 2);
    hip.rotationQuaternion!.set(hx * rw, hx * rz, hw * rz, hw * rw);
    knee.rotation.x = kneeAngle;
    this.kneeQuaternion.set(
      Math.sin(kneeAngle / 2),
      0,
      0,
      Math.cos(kneeAngle / 2),
    );
    hip.rotationQuaternion!.multiplyToRef(
      this.kneeQuaternion,
      this.legQuaternion,
    );
    this.legQuaternion.conjugateToRef(this.inverseLeg);
    Quaternion.RotationYawPitchRollToRef(
      shortestAngle(yaw, footYaw),
      toe * (1 - this.air),
      0,
      this.desiredFoot,
    );
    this.inverseLeg.multiplyToRef(this.desiredFoot, foot.rotationQuaternion!);
  }

  private poseArms(
    state: AvatarAnimationState,
    dt: number,
    run: number,
    driving: boolean,
  ) {
    const swing = Math.sin(this.cycle) * mix(0.25, 0.65, run) * this.movement;
    let leftArm = -swing,
      rightArm = swing;
    let leftSpread = -0.04,
      rightSpread = 0.04;
    let leftElbow = -0.1 - mix(0.25, 1.05, run) * this.movement;
    let rightElbow = leftElbow;
    const requested = driving ? "" : (state.emote ?? "");
    if (requested && requested !== this.gesture) {
      this.gesture = requested;
      this.gestureTime = 0;
    }
    this.gestureTime += dt;
    this.gestureWeight = mix(
      this.gestureWeight,
      requested ? 1 : 0,
      blend(12, dt),
    );
    let gestureLeft = leftArm,
      gestureRight = rightArm;
    let elbowLeft = leftElbow,
      elbowRight = rightElbow;
    let spreadLeft = leftSpread,
      spreadRight = rightSpread;
    switch (this.gesture) {
      case "❤️":
        gestureLeft = gestureRight = -0.75;
        elbowLeft = elbowRight = -1.55;
        spreadLeft = 0.45;
        spreadRight = -0.45;
        break;
      case "🎉":
        gestureLeft = -2.15 + Math.sin(this.gestureTime * 4) * 0.07;
        gestureRight = -2.15 - Math.sin(this.gestureTime * 4) * 0.07;
        elbowLeft = elbowRight = -0.45;
        spreadLeft = -0.25;
        spreadRight = 0.25;
        break;
      case "👍":
        gestureRight = -0.65;
        elbowRight = -1.3;
        spreadRight = -0.1;
        break;
      default:
        if (this.gesture) {
          gestureLeft = -1.8;
          elbowLeft = -0.85;
          spreadLeft = -0.25 + Math.sin(this.gestureTime * 7) * 0.12;
        }
    }
    leftArm = mix(leftArm, gestureLeft, this.gestureWeight);
    rightArm = mix(rightArm, gestureRight, this.gestureWeight);
    leftElbow = mix(leftElbow, elbowLeft, this.gestureWeight);
    rightElbow = mix(rightElbow, elbowRight, this.gestureWeight);
    leftSpread = mix(leftSpread, spreadLeft, this.gestureWeight);
    rightSpread = mix(rightSpread, spreadRight, this.gestureWeight);
    const factor = blend(24, dt);
    this.rig.arm.rotation.x = mix(this.rig.arm.rotation.x, leftArm, factor);
    this.rig.rightArm.rotation.x = mix(
      this.rig.rightArm.rotation.x,
      rightArm,
      factor,
    );
    this.rig.arm.rotation.z = mix(this.rig.arm.rotation.z, leftSpread, factor);
    this.rig.rightArm.rotation.z = mix(
      this.rig.rightArm.rotation.z,
      rightSpread,
      factor,
    );
    this.rig.leftElbow.rotation.x = mix(
      this.rig.leftElbow.rotation.x,
      leftElbow,
      factor,
    );
    this.rig.rightElbow.rotation.x = mix(
      this.rig.rightElbow.rotation.x,
      rightElbow,
      factor,
    );
  }
}
