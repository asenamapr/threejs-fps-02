// Effects: tracers, impact sparks, explosions. Everything is pooled and reused —
// no allocation in the frame loop — and every effect fades out on its own clock.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_LIFE = 0.09;
const SPARK_LIFE = 0.5;

export function createEffects(scene) {
  // Tracers are stretched boxes, not 1 px lines: a glowing streak the eye can follow.
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.ember), size: 0.09, transparent: true, opacity: 0, depthWrite: false,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparkState = { life: 0, velocities: new Float32Array(40 * 3), origin: new THREE.Vector3() };
  sparks.push(sparkState);

  const flash = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 14, 1.4);
  scene.add(flash);
  let flashLife = 0;

  const ring = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, depthWrite: false }),
  );
  ring.visible = false;
  scene.add(ring);
  let ringLife = 0;

  function spawnTracer(from, to) {
    const tracer = tracers.find((t) => t.life <= 0) || tracers[0];
    const mesh = tracer.mesh;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.lookAt(to);
    mesh.scale.set(1, 1, from.distanceTo(to));
    mesh.visible = true;
    tracer.life = TRACER_LIFE;
    mesh.material.opacity = 0.95;
  }

  function spawnImpact(point) {
    const state = sparkState;
    state.life = SPARK_LIFE;
    state.origin.copy(point);
    sparkMat.opacity = 0.9;
    const pos = sparkGeo.attributes.position.array;
    for (let i = 0; i < 40; i++) {
      pos[i * 3] = point.x;
      pos[i * 3 + 1] = point.y;
      pos[i * 3 + 2] = point.z;
      state.velocities[i * 3] = (Math.random() * 2 - 1) * 2.4;
      state.velocities[i * 3 + 1] = Math.random() * 3;
      state.velocities[i * 3 + 2] = (Math.random() * 2 - 1) * 2.4;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function spawnExplosion(point) {
    flash.position.copy(point);
    flash.position.y += 0.6;
    flash.intensity = 60;
    flashLife = 0.35;
    ring.position.copy(point);
    ring.position.y += 0.3;
    ring.visible = true;
    ringLife = 0.5;
    spawnImpact(point);
  }

  function step(dt) {    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.mesh.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.95;
      if (tracer.life <= 0) tracer.mesh.visible = false;
    }
    if (sparkState.life > 0) {
      sparkState.life -= dt;
      const pos = sparkGeo.attributes.position.array;
      for (let i = 0; i < 40; i++) {
        pos[i * 3] += sparkState.velocities[i * 3] * dt;
        pos[i * 3 + 1] += sparkState.velocities[i * 3 + 1] * dt;
        pos[i * 3 + 2] += sparkState.velocities[i * 3 + 2] * dt;
        sparkState.velocities[i * 3 + 1] -= 6 * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = Math.max(0, sparkState.life / SPARK_LIFE) * 0.9;
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flash.intensity = Math.max(0, flashLife / 0.35) * 60;
    }
    if (ringLife > 0) {
      ringLife -= dt;
      const t = 1 - ringLife / 0.5;
      ring.scale.setScalar(0.5 + t * 5);
      ring.material.opacity = Math.max(0, ringLife / 0.5) * 0.35;
      if (ringLife <= 0) ring.visible = false;
    }
  }

  // Hide every effect at once: the staged captures clear the pre-simulation's
  // tracers before the one shot that belongs in the frame.
  function reset() {
    for (const tracer of tracers) {
      tracer.life = 0;
      tracer.mesh.visible = false;
      tracer.mesh.material.opacity = 0;
    }
    sparkState.life = 0;
    sparkMat.opacity = 0;
    flashLife = 0;
    flash.intensity = 0;
    ringLife = 0;
    ring.visible = false;
  }

  return { spawnTracer, spawnImpact, spawnExplosion, step, reset };
}
