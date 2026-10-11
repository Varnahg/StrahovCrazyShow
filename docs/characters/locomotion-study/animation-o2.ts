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
  /** Flat-ankle reference: its sole contact stays fixed while the shoe rolls. */
  support: Vec3;
  anchorYaw: number;
  settleFrom: Vec3;
  settleTime: number;
  toe: number;
  yaw: number;
  phase: number;
  releasePhase: number;
  swingPlanned: boolean;
  swingFrom: Vec3;
  swingTo: Vec3;
  landingPelvisMax: number;
};
const footContact = (): FootContact => ({
  planted: false,
  initialized: false,
  anchor: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: 0 },
  support: { x: 0, y: 0, z: 0 },
  anchorYaw: 0,
  settleFrom: { x: 0, y: 0, z: 0 },
  settleTime: Infinity,
  toe: 0,
  yaw: 0,
  phase: 0,
  releasePhase: NaN,
  swingPlanned: false,
  swingFrom: { x: 0, y: 0, z: 0 },
  swingTo: { x: 0, y: 0, z: 0 },
  landingPelvisMax: Infinity,
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
  private pelvisWorldY = NaN;
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
    this.pelvisWorldY = NaN;
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
      contact.releasePhase = NaN;
      contact.swingPlanned = false;
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
    const duty = mix(mix(0.54, 0.25, run), 0.21, sprint);
    // A complete left-to-left cycle, not one step. At 4.6 m/s the old 2.06 m
    // cycle produced 4.47 steps/s and looked like a hurried cartoon jog.
    const stride = mix(0.9 + speed * 0.25, 1.6 + speed * 0.3, run);
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
    this.targetFoot(
      this.contacts.left,
      this.cycle / TAU,
      duty,
      stride,
      -1,
      state,
      moving,
      run,
      dt,
    );
    this.targetFoot(
      this.contacts.right,
      (this.cycle / TAU + 0.5) % 1,
      duty,
      stride,
      1,
      state,
      moving,
      run,
      dt,
    );
    // Use the same rolled ankle targets as the leg solver. A planted flat
    // ankle at both ends of a long stride forces an exaggerated squat.
    const m = this.rig.measurements;
    const pelvis =
      m.hipHeight -
      mix(0.062, 0.072, run) -
      Math.cos(this.cycle * 2) * mix(0.018, 0.023, run);
    const maximumReachable = this.supportedHipHeight(state);
    const pelvisTarget = mix(
      m.hipHeight,
      Math.min(pelvis, maximumReachable),
      this.movement,
    );
    const scaleY = this.rig.root.scaling.y;
    if (!Number.isFinite(this.pelvisWorldY))
      this.pelvisWorldY = position.y + pelvisTarget * scaleY;
    let targetWorldY = position.y + pelvisTarget * scaleY;
    for (const contact of Object.values(this.contacts)) {
      if (
        !contact.planted &&
        contact.swingPlanned &&
        contact.swingTo.y < position.y + (m.ankleHeight - 0.04) * scaleY
      ) {
        const anticipation = smooth(clamp((contact.phase - 0.58) / 0.26, 0, 1));
        targetWorldY = Math.min(
          targetWorldY,
          mix(targetWorldY, contact.landingPelvisMax, anticipation),
        );
      }
    }
    this.pelvisWorldY = Math.min(
      mix(this.pelvisWorldY, targetWorldY, blend(26, dt)),
      position.y + mix(m.hipHeight, maximumReachable, this.movement) * scaleY,
    );
    this.rig.hips.position.y = (this.pelvisWorldY - position.y) / scaleY;
    this.solveFoot(
      this.contacts.left,
      this.rig.left,
      this.rig.leftKnee,
      this.rig.leftFoot,
      -1,
      state,
    );
    this.solveFoot(
      this.contacts.right,
      this.rig.right,
      this.rig.rightKnee,
      this.rig.rightFoot,
      1,
      state,
    );
    this.poseArms(state, dt, run, driving);
  }

  private supportedHipHeight(state: AvatarAnimationState) {
    const m = this.rig.measurements,
      scale = this.rig.root.scaling;
    const yaw = this.rig.root.rotation.y,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    let height = m.hipHeight + 0.18;
    for (let index = 0; index < 2; index++) {
      const side = index ? 1 : -1;
      const contact = index ? this.contacts.right : this.contacts.left;
      if (!contact.planted) continue;
      const lateral = side * m.legSpacing;
      const x = contact.target.x,
        worldZ = contact.target.z;
      const dx = x - state.position.x,
        dz = worldZ - state.position.z;
      const localX = (c * dx - s * dz) / scale.x - lateral,
        localZ = (s * dx + c * dz) / scale.z;
      const footY = (contact.target.y - state.position.y) / scale.y;
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
    return clamp(height, m.hipHeight - 0.3, m.hipHeight + 0.18);
  }

  private targetFoot(
    contact: FootContact,
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
    const forwardReach = stride * duty * 0.5;
    const rearReach = forwardReach - stride * duty;
    const heelPitch = -0.16;
    const toePitch = mix(0.5, 0.62, run);
    const rollOffset = (pitch: number, pivotZ: number) => ({
      y:
        -m.ankleHeight +
        m.ankleHeight * Math.cos(pitch) +
        pivotZ * Math.sin(pitch),
      // The sole is below the ankle: its local Y is -ankleHeight. Rx therefore
      // contributes -ankleHeight*sin(pitch) to Z, as in clearSole/FK below.
      z: pivotZ - (-m.ankleHeight * Math.sin(pitch) + pivotZ * Math.cos(pitch)),
    });
    const groundAt = (x: number, z: number) =>
      state.groundHeight?.(x, z) ?? root.y;
    const shoeGround = (x: number, z: number, angle: number) =>
      Math.max(
        groundAt(x, z),
        groundAt(x - Math.sin(angle) * 0.085, z - Math.cos(angle) * 0.085),
        groundAt(x + Math.sin(angle) * 0.191, z + Math.cos(angle) * 0.191),
      );
    let toe = 0,
      footYaw = yaw;
    if (phase < contact.phase) {
      contact.releasePhase = NaN;
      contact.swingPlanned = false;
    }
    contact.phase = phase;
    if (
      contact.planted &&
      phase < duty &&
      root.y - (contact.support.y - m.ankleHeight * scale.y) > 0.18
    ) {
      // The capsule can step onto the next tread before toe-off. Release the
      // lower support instead of pulling the entire torso down to an old step.
      contact.releasePhase = phase;
      contact.swingPlanned = false;
    }
    const stance = phase < duty && !Number.isFinite(contact.releasePhase);
    if (!contact.initialized) {
      contact.initialized = true;
      contact.anchor.x = root.x + c * lateral * scale.x;
      contact.anchor.z = root.z - s * lateral * scale.x;
      contact.anchor.y =
        shoeGround(contact.anchor.x, contact.anchor.z, yaw) +
        m.ankleHeight * scale.y;
      contact.anchorYaw = yaw;
      contact.planted = true;
      Object.assign(contact.support, contact.anchor);
      Object.assign(contact.target, contact.anchor);
    }
    if (moving && this.air < 0.5) {
      if (stance) {
        if (!contact.planted) {
          // The render frame can land slightly after phase zero. Account for
          // that travelled distance instead of snapping forward by one frame.
          const landing = forwardReach - stride * phase;
          contact.support.x =
            root.x + c * lateral * scale.x + s * landing * scale.z;
          contact.support.z =
            root.z - s * lateral * scale.x + c * landing * scale.z;
          contact.support.y =
            shoeGround(contact.support.x, contact.support.z, yaw) +
            m.ankleHeight * scale.y;
          contact.anchorYaw = yaw;
        }
        contact.planted = true;
        contact.swingPlanned = false;
        const stanceProgress = phase / duty;
        toe =
          stanceProgress < 0.22
            ? heelPitch * (1 - smooth(stanceProgress / 0.22))
            : toePitch * smooth(clamp((stanceProgress - 0.62) / 0.38, 0, 1));
        const offset = rollOffset(toe, toe < 0 ? -0.085 : 0.191);
        contact.target.x =
          contact.support.x + Math.sin(contact.anchorYaw) * offset.z * scale.z;
        contact.target.z =
          contact.support.z + Math.cos(contact.anchorYaw) * offset.z * scale.z;
        contact.target.y = contact.support.y + offset.y * scale.y;
        Object.assign(contact.anchor, contact.target);
        footYaw = contact.anchorYaw;
      } else {
        const wasPlanted = contact.planted;
        contact.planted = false;
        const takeOff = Number.isFinite(contact.releasePhase)
          ? contact.releasePhase
          : duty;
        const progress = clamp((phase - takeOff) / (1 - takeOff), 0, 1);
        const toeOff = rollOffset(toePitch, 0.191);
        const heelStrike = rollOffset(heelPitch, -0.085);
        if (!contact.swingPlanned) {
          contact.swingPlanned = true;
          if (Number.isFinite(contact.releasePhase) && wasPlanted)
            Object.assign(contact.swingFrom, contact.target);
          else {
            contact.swingFrom.x =
              root.x +
              c * lateral * scale.x +
              s * (rearReach + toeOff.z - stride * (phase - duty)) * scale.z;
            contact.swingFrom.z =
              root.z -
              s * lateral * scale.x +
              c * (rearReach + toeOff.z - stride * (phase - duty)) * scale.z;
            contact.swingFrom.y =
              shoeGround(contact.swingFrom.x, contact.swingFrom.z, yaw) +
              (m.ankleHeight + toeOff.y) * scale.y;
          }
          const landing = forwardReach + heelStrike.z + stride * (1 - phase);
          contact.swingTo.x =
            root.x + c * lateral * scale.x + s * landing * scale.z;
          contact.swingTo.z =
            root.z - s * lateral * scale.x + c * landing * scale.z;
          contact.swingTo.y =
            shoeGround(contact.swingTo.x, contact.swingTo.z, yaw) +
            (m.ankleHeight + heelStrike.y) * scale.y;
          const legLength = m.thigh + m.shin - 0.0005;
          contact.landingPelvisMax =
            contact.swingTo.y +
            (Math.sqrt(
              Math.max(
                0,
                legLength * legLength - (forwardReach + heelStrike.z) ** 2,
              ),
            ) -
              0.006) *
              scale.y;
        }
        toe =
          mix(toePitch, heelPitch, smooth(progress)) -
          Math.sin(Math.PI * progress) * 0.35;
        contact.target.x = mix(
          contact.swingFrom.x,
          contact.swingTo.x,
          smooth(progress),
        );
        contact.target.z = mix(
          contact.swingFrom.z,
          contact.swingTo.z,
          smooth(progress),
        );
        const lift =
          smooth(clamp(progress / 0.38, 0, 1)) *
          (1 - smooth(clamp((progress - 0.38) / 0.62, 0, 1)));
        contact.target.y = Math.max(
          groundAt(contact.target.x, contact.target.z) +
            m.ankleHeight * scale.y,
          mix(contact.swingFrom.y, contact.swingTo.y, smooth(progress)) +
            lift * mix(0.09, 0.32, run) * scale.y,
        );
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
      const floor = shoeGround(contact.target.x, contact.target.z, yaw);
      contact.target.y =
        floor +
        (m.ankleHeight + Math.sin(Math.PI * progress) * 0.055) * scale.y;
      contact.planted = progress === 0 || progress === 1;
      if (progress === 1) {
        Object.assign(contact.anchor, contact.target);
        Object.assign(contact.support, contact.target);
        contact.anchorYaw = yaw;
      }
    }
    contact.toe = toe;
    contact.yaw = footYaw;
    if (contact.planted) this.clearSole(contact, state);
  }

  private clearSole(contact: FootContact, state: AvatarAnimationState) {
    if (state.groundHeight && this.air < 0.5) {
      // Check the shoe, not only its ankle. A 15 cm riser can sit immediately
      // in front of a perfectly valid ankle query; the former solver allowed
      // the visible toe/sole to pass through it. Conservative sole corners
      // use the actual production shoe's -0.085..0.191 m longitudinal bounds.
      let clearance = 0;
      let highestGround = -Infinity,
        lowestGround = Infinity,
        lowestSole = Infinity;
      const scale = this.rig.root.scaling,
        m = this.rig.measurements;
      const halfShoeWidth = 0.066 * (m.legSpacing / 0.105);
      const cy = Math.cos(contact.yaw),
        sy = Math.sin(contact.yaw),
        cp = Math.cos(contact.toe),
        sp = Math.sin(contact.toe);
      for (const shoeZ of [-0.085, 0.191])
        for (const shoeX of [-halfShoeWidth, halfShoeWidth]) {
          const y = -m.ankleHeight * cp - shoeZ * sp;
          const z = -m.ankleHeight * sp + shoeZ * cp;
          const xWorld = contact.target.x + (cy * shoeX + sy * z) * scale.x;
          const zWorld = contact.target.z + (-sy * shoeX + cy * z) * scale.z;
          const ground = state.groundHeight(xWorld, zWorld) ?? state.position.y;
          highestGround = Math.max(highestGround, ground);
          lowestGround = Math.min(lowestGround, ground);
          lowestSole = Math.min(lowestSole, y * scale.y);
          clearance = Math.max(
            clearance,
            ground - (contact.target.y + y * scale.y),
          );
        }
      if (highestGround - lowestGround > 0.07) {
        // A riser can cross the middle of the sole, between the samples. Keep
        // the entire shoe above its higher tread until the next full foothold.
        clearance = Math.max(
          clearance,
          highestGround - contact.target.y - lowestSole,
        );
      }
      contact.target.y += clearance;
      if (contact.planted) contact.anchor.y = contact.target.y;
    }
  }

  private solveFoot(
    contact: FootContact,
    hip: TransformNode,
    knee: TransformNode,
    foot: TransformNode,
    side: number,
    state: AvatarAnimationState,
  ) {
    const m = this.rig.measurements,
      root = state.position,
      yaw = this.rig.root.rotation.y,
      c = Math.cos(yaw),
      s = Math.sin(yaw),
      scale = this.rig.root.scaling,
      lateral = side * m.legSpacing;
    const dx = contact.target.x - root.x,
      dz = contact.target.z - root.z;
    let localX = (c * dx - s * dz) / scale.x;
    let localZ = (s * dx + c * dz) / scale.z;
    let localY = (contact.target.y - root.y) / scale.y;
    if (!contact.planted && this.air < 0.5) {
      // Knee recovery is allowed to shorten the swing path. Never drag a
      // support point or lower the torso to reach an impossible trailing shoe.
      const legLength = m.thigh + m.shin - 0.001;
      localY = Math.max(localY, this.rig.hips.position.y - legLength);
      const vertical = localY - this.rig.hips.position.y;
      const radius = Math.hypot(localX - lateral, localZ);
      const reachable = Math.sqrt(
        Math.max(0, legLength * legLength - vertical * vertical),
      );
      if (radius > reachable) {
        const factor = reachable / radius;
        localX = lateral + (localX - lateral) * factor;
        localZ *= factor;
      }
      contact.target.x = root.x + c * localX * scale.x + s * localZ * scale.z;
      contact.target.z = root.z - s * localX * scale.x + c * localZ * scale.z;
      contact.target.y = root.y + localY * scale.y;
      this.clearSole(contact, state);
      localY = (contact.target.y - root.y) / scale.y;
    }
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
      shortestAngle(yaw, contact.yaw),
      contact.toe * (1 - this.air),
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
    const swing = Math.sin(this.cycle) * mix(0.24, 0.46, run) * this.movement;
    // Slight shoulder extension centres the hands beside the hips. Previously
    // a 66° elbow bend plus symmetric shoulder swing held BOTH hands forward.
    const extension = mix(0.045, 0.24, run) * this.movement;
    let leftArm = extension - swing,
      rightArm = extension + swing;
    let leftSpread = -0.04,
      rightSpread = 0.04;
    let leftElbow = -0.1 - mix(0.07, 0.65, run) * this.movement;
    let rightElbow = leftElbow;
    const elbowFollow =
      Math.sin(this.cycle) * mix(0.025, 0.1, run) * this.movement;
    leftElbow -= elbowFollow;
    rightElbow += elbowFollow;
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

