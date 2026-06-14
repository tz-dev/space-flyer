import * as THREE from "three";

const MAX_SKY_OBJECTS = 12;
const SKY_OBJECT_FLOAT_STRIDE = 8;

export class TerrainSkyObjectsMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      depthWrite: false,
      depthTest: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        iResolution: { value: new THREE.Vector3(1, 1, 1) },
        iTime: { value: 0 },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamForward: { value: new THREE.Vector3(0, 0, -1) },
        uObjectCount: { value: 0 },
        uSkyObjects: { value: new Float32Array(MAX_SKY_OBJECTS * SKY_OBJECT_FLOAT_STRIDE) }
      },
      vertexShader: /* glsl */`
        void main() {
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;

        uniform vec3 iResolution;
        uniform float iTime;
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        uniform vec3 uCamForward;
        uniform int uObjectCount;
        uniform float uSkyObjects[${MAX_SKY_OBJECTS * SKY_OBJECT_FLOAT_STRIDE}];

        const int MAX_SKY_OBJECTS = ${MAX_SKY_OBJECTS};
        const int SKY_OBJECT_FLOAT_STRIDE = ${SKY_OBJECT_FLOAT_STRIDE};

        float objectValue(int objectIndex, int fieldIndex) {
          return uSkyObjects[objectIndex * SKY_OBJECT_FLOAT_STRIDE + fieldIndex];
        }

        vec3 objectDirection(int objectIndex) {
          return normalize(vec3(
            objectValue(objectIndex, 0),
            objectValue(objectIndex, 1),
            objectValue(objectIndex, 2)
          ));
        }

        vec3 objectColor(int objectIndex) {
          return vec3(
            objectValue(objectIndex, 3),
            objectValue(objectIndex, 4),
            objectValue(objectIndex, 5)
          );
        }

        float objectAngularRadius(int objectIndex) {
          return max(0.0005, objectValue(objectIndex, 6));
        }

        float objectType(int objectIndex) {
          return objectValue(objectIndex, 7);
        }

        float saturate(float value) {
          return clamp(value, 0.0, 1.0);
        }

        void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / max(1.0, iResolution.y);
          vec3 rd = normalize(uCamForward + uCamRight * uv.x + uCamUp * uv.y);
          vec3 color = vec3(0.0);
          float alpha = 0.0;

          for (int index = 0; index < MAX_SKY_OBJECTS; index += 1) {
            if (index >= uObjectCount) {
              break;
            }

            vec3 direction = objectDirection(index);

            if (direction.y < -0.08) {
              continue;
            }

            float angularRadius = objectAngularRadius(index);
            float cosAngle = dot(rd, direction);
            float angularDistance = acos(clamp(cosAngle, -1.0, 1.0));
            float type = objectType(index);
            float disc = 1.0 - smoothstep(angularRadius * 0.78, angularRadius, angularDistance);
            float glow = 1.0 - smoothstep(angularRadius, angularRadius * mix(3.6, 1.8, step(0.5, type)), angularDistance);
            vec3 objectColorValue = objectColor(index);

            if (type < 0.5) {
              float pulse = 0.88 + 0.12 * sin(iTime * 1.6);
              color += objectColorValue * (disc * 2.8 + glow * 0.52) * pulse;
              alpha = max(alpha, saturate(disc + glow * 0.42));
            } else {
              float limb = 1.0 - smoothstep(0.0, angularRadius, angularDistance);
              vec3 shadedColor = objectColorValue * (0.45 + 0.55 * limb);
              color += shadedColor * (disc * 0.92 + glow * 0.08);
              alpha = max(alpha, saturate(disc * 0.92 + glow * 0.10));
            }
          }

          gl_FragColor = vec4(color, alpha);
        }
      `
    });
  }

  setResolution(width, height, pixelRatio = 1) {
    this.uniforms.iResolution.value.set(
      Math.max(1, width * pixelRatio),
      Math.max(1, height * pixelRatio),
      pixelRatio
    );
  }

  setTime(elapsedTime) {
    this.uniforms.iTime.value = elapsedTime;
  }

  setCameraBasis({ right, up, forward }) {
    this.uniforms.uCamRight.value.copy(right);
    this.uniforms.uCamUp.value.copy(up);
    this.uniforms.uCamForward.value.copy(forward);
  }

  setSkyObjects(skyObjects = []) {
    const data = this.uniforms.uSkyObjects.value;
    data.fill(0);

    const count = Math.min(skyObjects.length, MAX_SKY_OBJECTS);

    for (let index = 0; index < count; index += 1) {
      const object = skyObjects[index];
      const offset = index * SKY_OBJECT_FLOAT_STRIDE;
      const direction = object.directionLocal ?? [0, 1, 0];
      const color = object.color ?? [1, 1, 1];

      data[offset + 0] = direction[0] ?? 0;
      data[offset + 1] = direction[1] ?? 1;
      data[offset + 2] = direction[2] ?? 0;
      data[offset + 3] = color[0] ?? 1;
      data[offset + 4] = color[1] ?? 1;
      data[offset + 5] = color[2] ?? 1;
      data[offset + 6] = Math.max(0.0005, object.angularRadius ?? 0.01);
      data[offset + 7] = object.type === "planet" ? 1 : 0;
    }

    this.uniforms.uObjectCount.value = count;
  }
}
