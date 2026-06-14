import * as THREE from "three";

const HUD_FRAGMENT_SHADER = /* glsl */`

precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 uTargetOffset;
uniform vec2 uLagOffset;
uniform float uHudScale;
uniform float uHudOpacity;
uniform float uAltitudeMeters;
uniform float uCameraRotationDegrees;
uniform float uRollLag;
uniform float uAltitudeTapeOffset;

#define PI 3.14159265359
#define QUARTER_PI 0.78539816339
#define HALF_PI 1.57079632679
#define TWO_PI 6.28318530718

const vec4 BLUE      = vec4(0.100, 0.850, 1.000, 1.000);
const vec4 RED       = vec4(0.941, 0.306, 0.208, 1.000);
const vec4 GREY_BLUE = vec4(0.494, 0.620, 0.663, 1.000);
const vec4 YELLOW    = vec4(0.969, 1.000, 0.804, 1.000);
const vec4 GREEN     = vec4(0.804, 1.000, 0.965, 1.000);
const vec4 GREY      = vec4(0.449, 0.481, 0.489, 1.000);
const vec4 WHITE     = vec4(1.000, 1.000, 1.000, 1.000);

// Color / brightness tuning.
const float HUD_GRID_ALPHA             = 0.040;
const float HUD_DOT_FIELD_ALPHA        = 0.085;

const float HUD_INNER_RED_ALPHA        = 1.000;
const float HUD_INNER_WHITE_ALPHA      = 1.000;
const float HUD_CROSS_ALPHA            = 1.000;

const float HUD_MID_RING_A_ALPHA       = 0.650;
const float HUD_MID_RING_B_ALPHA       = 0.820;
const float HUD_MID_RING_C_ALPHA       = 0.600;
const float HUD_INNER_DOTS_ALPHA       = 0.880;
const float HUD_BRACKET_ALPHA          = 0.720;

const float HUD_OUTER_WHITE_GLOW_ALPHA = 0.180;
const float HUD_OUTER_WHITE_ALPHA      = 0.960;
const float HUD_OUTER_BLUE_GLOW_ALPHA  = 0.260;
const float HUD_OUTER_BLUE_ALPHA       = 1.000;
const float HUD_OUTER_CYAN_ALPHA       = 0.720;
const float HUD_SIDE_GLOW_ALPHA        = 0.180;
const float HUD_SIDE_BLUE_ALPHA        = 0.880;
const float HUD_OUTER_DOT_GLOW_ALPHA   = 0.160;
const float HUD_OUTER_DOT_ALPHA        = 0.880;

const float HUD_ALT_RAIL_ALPHA         = 0.850;
const float HUD_ALT_MARKER_ALPHA       = 1.150;
const float HUD_ALT_TICK_MINOR_ALPHA   = 0.760;
const float HUD_ALT_TICK_MAJOR_ALPHA   = 1.200;

const float HUD_LOWER_TICK_ALPHA       = 0.700;
const float HUD_CENTER_DOT_ALPHA       = 0.850;
const float HUD_PULSE_AMOUNT           = 0.060;

const float LINE_WEIGHT = 0.0035;
const float HUD_BASE_LAYOUT_SCALE = 0.5;

float SMOOTH = 0.0015;
float HUD_STROKE_SCALE = 1.0;

float mapValue(float value, float istart, float istop, float ostart, float ostop) {
  return ostart + (ostop - ostart) * ((value - istart) / max(0.00001, istop - istart));
}

float safeLine(vec2 p, vec2 a, vec2 b, float width) {
  width *= HUD_STROKE_SCALE;

  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  float d = length(pa - ba * h);

  return 1.0 - smoothstep(width, width + SMOOTH * 2.0 * HUD_STROKE_SCALE, d);
}

float safeDot(vec2 p, vec2 center, float radius) {
  radius *= HUD_STROKE_SCALE;

  float d = length(p - center);
  return 1.0 - smoothstep(radius, radius + SMOOTH * 2.0 * HUD_STROKE_SCALE, d);
}

float safeRing(vec2 p, float radius, float width) {
  width *= HUD_STROKE_SCALE;

  float d = abs(length(p) - radius);
  return 1.0 - smoothstep(width, width + SMOOTH * 2.0 * HUD_STROKE_SCALE, d);
}

float angleDiff(float a, float b) {
  return abs(mod(a - b + PI, TWO_PI) - PI);
}

float safeArc(vec2 p, float radius, float width, float centerAngle, float arcWidth) {
  float ring = safeRing(p, radius, width);
  float a = atan(p.y, p.x);
  float sector = 1.0 - smoothstep(
    arcWidth,
    arcWidth + SMOOTH * 18.0 * HUD_STROKE_SCALE,
    angleDiff(a, centerAngle)
  );

  return ring * sector;
}

float safeGrid(vec2 p, float scale, float width) {
  width *= HUD_STROKE_SCALE;

  vec2 q = p * scale;
  vec2 cell = abs(fract(q) - 0.5);
  float line = min(cell.x, cell.y);

  return 1.0 - smoothstep(width, width + SMOOTH * 2.0 * HUD_STROKE_SCALE, line);
}

float safeDots(vec2 p, float scale, float radius) {
  radius *= HUD_STROKE_SCALE;

  vec2 q = p * scale;
  vec2 nearest = floor(q + vec2(0.5));
  float d = length(q - nearest);

  return 1.0 - smoothstep(radius, radius + SMOOTH * 2.0 * HUD_STROKE_SCALE, d);
}

float safeHorizontalSegment(vec2 p, float y, float x0, float x1, float width) {
  return safeLine(p, vec2(x0, y), vec2(x1, y), width);
}

float safeVerticalSegment(vec2 p, float x, float y0, float y1, float width) {
  return safeLine(p, vec2(x, y0), vec2(x, y1), width);
}

vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * p;
}

float hudTextSegment(vec2 p, vec2 a, vec2 b, float width) {
  return safeLine(p, a, b, width);
}

float hudDigitGlyph(vec2 p, float digit, float width) {
  float d = floor(digit + 0.5);
  float s = 0.0;

  float top = hudTextSegment(p, vec2(-0.26,  0.42), vec2( 0.26,  0.42), width);
  float upperRight = hudTextSegment(p, vec2( 0.31,  0.36), vec2( 0.31,  0.06), width);
  float lowerRight = hudTextSegment(p, vec2( 0.31, -0.06), vec2( 0.31, -0.36), width);
  float bottom = hudTextSegment(p, vec2(-0.26, -0.42), vec2( 0.26, -0.42), width);
  float lowerLeft = hudTextSegment(p, vec2(-0.31, -0.06), vec2(-0.31, -0.36), width);
  float upperLeft = hudTextSegment(p, vec2(-0.31,  0.36), vec2(-0.31,  0.06), width);
  float middle = hudTextSegment(p, vec2(-0.24,  0.00), vec2( 0.24,  0.00), width);

  if (d < 0.5) {
    s = top + upperRight + lowerRight + bottom + lowerLeft + upperLeft;
  } else if (d < 1.5) {
    s = upperRight + lowerRight;
  } else if (d < 2.5) {
    s = top + upperRight + middle + lowerLeft + bottom;
  } else if (d < 3.5) {
    s = top + upperRight + middle + lowerRight + bottom;
  } else if (d < 4.5) {
    s = upperLeft + middle + upperRight + lowerRight;
  } else if (d < 5.5) {
    s = top + upperLeft + middle + lowerRight + bottom;
  } else if (d < 6.5) {
    s = top + upperLeft + middle + lowerLeft + lowerRight + bottom;
  } else if (d < 7.5) {
    s = top + upperRight + lowerRight;
  } else if (d < 8.5) {
    s = top + upperRight + lowerRight + bottom + lowerLeft + upperLeft + middle;
  } else {
    s = top + upperRight + lowerRight + bottom + upperLeft + middle;
  }

  return clamp(s, 0.0, 1.0);
}

float hudGlyphA(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.30, -0.42), vec2(-0.30,  0.20), width) +
    hudTextSegment(p, vec2( 0.30, -0.42), vec2( 0.30,  0.20), width) +
    hudTextSegment(p, vec2(-0.30,  0.20), vec2( 0.00,  0.44), width) +
    hudTextSegment(p, vec2( 0.30,  0.20), vec2( 0.00,  0.44), width) +
    hudTextSegment(p, vec2(-0.23,  0.02), vec2( 0.23,  0.02), width),
    0.0,
    1.0
  );
}

float hudGlyphL(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.28,  0.42), vec2(-0.28, -0.42), width) +
    hudTextSegment(p, vec2(-0.28, -0.42), vec2( 0.28, -0.42), width),
    0.0,
    1.0
  );
}

float hudGlyphT(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.34,  0.42), vec2( 0.34,  0.42), width) +
    hudTextSegment(p, vec2( 0.00,  0.42), vec2( 0.00, -0.42), width),
    0.0,
    1.0
  );
}

float hudGlyphY(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.32,  0.42), vec2( 0.00,  0.06), width) +
    hudTextSegment(p, vec2( 0.32,  0.42), vec2( 0.00,  0.06), width) +
    hudTextSegment(p, vec2( 0.00,  0.06), vec2( 0.00, -0.42), width),
    0.0,
    1.0
  );
}

float hudGlyphR(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.28, -0.42), vec2(-0.28,  0.42), width) +
    hudTextSegment(p, vec2(-0.28,  0.42), vec2( 0.20,  0.42), width) +
    hudTextSegment(p, vec2( 0.20,  0.42), vec2( 0.30,  0.18), width) +
    hudTextSegment(p, vec2( 0.30,  0.18), vec2( 0.18,  0.00), width) +
    hudTextSegment(p, vec2(-0.28,  0.00), vec2( 0.18,  0.00), width) +
    hudTextSegment(p, vec2(-0.02,  0.00), vec2( 0.30, -0.42), width),
    0.0,
    1.0
  );
}

float hudGlyphW(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.34,  0.42), vec2(-0.24, -0.42), width) +
    hudTextSegment(p, vec2(-0.24, -0.42), vec2( 0.00, -0.12), width) +
    hudTextSegment(p, vec2( 0.00, -0.12), vec2( 0.24, -0.42), width) +
    hudTextSegment(p, vec2( 0.24, -0.42), vec2( 0.34,  0.42), width),
    0.0,
    1.0
  );
}

float hudGlyphO(vec2 p, float width) {
  return clamp(
    hudTextSegment(p, vec2(-0.28,  0.34), vec2(-0.28, -0.34), width) +
    hudTextSegment(p, vec2( 0.28,  0.34), vec2( 0.28, -0.34), width) +
    hudTextSegment(p, vec2(-0.20,  0.42), vec2( 0.20,  0.42), width) +
    hudTextSegment(p, vec2(-0.20, -0.42), vec2( 0.20, -0.42), width),
    0.0,
    1.0
  );
}

float hudGlyphAt(vec2 uv, vec2 center, float scale, float glyphId) {
  vec2 p = (uv - center) / scale;
  float width = 0.040 * HUD_STROKE_SCALE;

  if (glyphId < 0.5) {
    return hudGlyphA(p, width);
  }

  if (glyphId < 1.5) {
    return hudGlyphL(p, width);
  }

  if (glyphId < 2.5) {
    return hudGlyphT(p, width);
  }

  if (glyphId < 3.5) {
    return hudGlyphY(p, width);
  }

  if (glyphId < 4.5) {
    return hudGlyphW(p, width);
  }

  if (glyphId < 5.5) {
    return hudGlyphR(p, width);
  }

  return hudGlyphO(p, width);
}

float hudDigitAt(vec2 uv, vec2 center, float scale, float digit) {
  vec2 p = (uv - center) / scale;
  return hudDigitGlyph(p, digit, 0.040 * HUD_STROKE_SCALE);
}

float hudUnsignedInt5(vec2 uv, vec2 start, float scale, float value) {
  float v = floor(clamp(value, 0.0, 99999.0) + 0.5);
  float stepX = scale * 0.76;
  float s = 0.0;

  float d0 = floor(mod(v / 10000.0, 10.0));
  float d1 = floor(mod(v / 1000.0, 10.0));
  float d2 = floor(mod(v / 100.0, 10.0));
  float d3 = floor(mod(v / 10.0, 10.0));
  float d4 = floor(mod(v, 10.0));

  if (v >= 10000.0) {
    s += hudDigitAt(uv, start + vec2(stepX * 0.0, 0.0), scale, d0);
  }

  if (v >= 1000.0) {
    s += hudDigitAt(uv, start + vec2(stepX * 1.0, 0.0), scale, d1);
  }

  if (v >= 100.0) {
    s += hudDigitAt(uv, start + vec2(stepX * 2.0, 0.0), scale, d2);
  }

  if (v >= 10.0) {
    s += hudDigitAt(uv, start + vec2(stepX * 3.0, 0.0), scale, d3);
  }

  s += hudDigitAt(uv, start + vec2(stepX * 4.0, 0.0), scale, d4);

  return clamp(s, 0.0, 1.0);
}

float hudUnsignedInt3(vec2 uv, vec2 start, float scale, float value) {
  float v = floor(clamp(value, 0.0, 999.0) + 0.5);
  float stepX = scale * 0.76;
  float s = 0.0;

  float d0 = floor(mod(v / 100.0, 10.0));
  float d1 = floor(mod(v / 10.0, 10.0));
  float d2 = floor(mod(v, 10.0));

  if (v >= 100.0) {
    s += hudDigitAt(uv, start + vec2(stepX * 0.0, 0.0), scale, d0);
  }

  if (v >= 10.0) {
    s += hudDigitAt(uv, start + vec2(stepX * 1.0, 0.0), scale, d1);
  }

  s += hudDigitAt(uv, start + vec2(stepX * 2.0, 0.0), scale, d2);

  return clamp(s, 0.0, 1.0);
}

void main() {
  SMOOTH = max(0.0008, mapValue(iResolution.x, 800.0, 2560.0, 0.0025, 0.0010));

  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = 2.0 * (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float hudLayoutScale = max(0.0001, uHudScale);
  uv /= hudLayoutScale;

  // HUD Scale changes only layout distances.
  // Line/dot thickness stays visually stable relative to the default 0.5 layout scale.
  HUD_STROKE_SCALE = HUD_BASE_LAYOUT_SCALE / hudLayoutScale;

  vec2 directTargetPosition = uv - uTargetOffset;
  vec2 lagTargetPosition = uv - uLagOffset;

  float redSpin = -iTime * 1.05;
  float whiteSpin = iTime * 0.85;

  vec4 finalCol = vec4(0.0);

  // Inner red cursor arcs: direct mouse response, rotating right.
  float innerRed =
    safeArc(directTargetPosition, 0.1092, LINE_WEIGHT * 1.30, QUARTER_PI * 0.5 + redSpin, QUARTER_PI * 0.55) +
    safeArc(directTargetPosition, 0.1092, LINE_WEIGHT * 1.30, PI + QUARTER_PI * 0.5 + redSpin, QUARTER_PI * 0.55);

  finalCol = mix(finalCol, RED, clamp(innerRed, 0.0, 1.0) * HUD_INNER_RED_ALPHA);

  // Inner white cursor arcs: direct mouse response, rotating left.
  float innerWhite =
    safeArc(directTargetPosition, 0.2777, LINE_WEIGHT * 1.15, QUARTER_PI * 0.5 + whiteSpin, QUARTER_PI * 0.55) +
    safeArc(directTargetPosition, 0.2777, LINE_WEIGHT * 1.15, PI + QUARTER_PI * 0.5 + whiteSpin, QUARTER_PI * 0.55);

  finalCol = mix(finalCol, WHITE, clamp(innerWhite, 0.0, 1.0) * HUD_INNER_WHITE_ALPHA);

  // Center crosshair: direct mouse response.
  float cross =
    safeHorizontalSegment(directTargetPosition, 0.0, -0.3000, -0.0350, LINE_WEIGHT * 1.35) +
    safeHorizontalSegment(directTargetPosition, 0.0,  0.0350,  0.3000, LINE_WEIGHT * 1.35) +
    safeVerticalSegment(directTargetPosition, 0.0, -0.3000, -0.0550, LINE_WEIGHT * 1.15) +
    safeVerticalSegment(directTargetPosition, 0.0,  0.0550,  0.3000, LINE_WEIGHT * 1.15);

  finalCol = mix(finalCol, BLUE, clamp(cross, 0.0, 1.0) * HUD_CROSS_ALPHA);

  // Mid rings: delayed follow.
  float ringA = safeRing(lagTargetPosition, 0.3490, LINE_WEIGHT);
  float ringB = safeRing(lagTargetPosition, 0.4138, LINE_WEIGHT);
  float ringC = safeRing(lagTargetPosition, 0.4527, LINE_WEIGHT);

  finalCol = mix(finalCol, GREY, ringA * HUD_MID_RING_A_ALPHA);
  finalCol = mix(finalCol, WHITE, ringB * HUD_MID_RING_B_ALPHA);
  finalCol = mix(finalCol, GREY_BLUE, ringC * HUD_MID_RING_C_ALPHA);

  // Dotted inner sector around target.
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float a = -HALF_PI * 0.58 + fi * (HALF_PI * 1.16 / 23.0);

    vec2 p = vec2(cos(a), sin(a)) * 0.3490;

    float d1 = safeDot(lagTargetPosition, p, 0.0045);
    float d2 = safeDot(lagTargetPosition, -p, 0.0045);

    finalCol = mix(finalCol, RED, clamp((d1 + d2) * HUD_INNER_DOTS_ALPHA, 0.0, 1.0));
  }

  // Additional safe reticle brackets: delayed follow.
  float bracketA =
    safeArc(lagTargetPosition, 0.5750, LINE_WEIGHT, 0.0, 1.0000) +
    safeArc(lagTargetPosition, 0.5750, LINE_WEIGHT, PI, 1.0000);

  finalCol = mix(finalCol, BLUE, clamp(bracketA, 0.0, 1.0) * HUD_BRACKET_ALPHA);

  // Outer arcs. Safe arcs only, no filled sectors.
  // The second outermost ring follows roll with a lag.
  // The outermost half-circle rotates gently in the opposite direction.
  vec2 rollLagPosition = rotate2D(uv, -uRollLag * 1.00);
  vec2 outerCounterRollPosition = rotate2D(uv, uRollLag * 1.00);

  float outerWhite =
    safeArc(outerCounterRollPosition, 1.4805, LINE_WEIGHT * 1.30, 0.0, 0.7000) +
    safeArc(outerCounterRollPosition, 1.4805, LINE_WEIGHT * 1.30, PI, 0.7000);

  float outerBlue =
    safeArc(rollLagPosition, 1.3021, LINE_WEIGHT * 1.55, 0.0, 0.6685) +
    safeArc(rollLagPosition, 1.3021, LINE_WEIGHT * 1.55, PI, 0.6685);

  float outerCyan =
    safeArc(rollLagPosition, 1.3021, LINE_WEIGHT * 1.35, HALF_PI, 0.7000) +
    safeArc(rollLagPosition, 1.3021, LINE_WEIGHT * 1.35, -HALF_PI, 0.7000);

  // Soft glow/support rings so the outer HUD reads more clearly.
  float outerWhiteGlow =
    safeArc(outerCounterRollPosition, 1.4805, LINE_WEIGHT * 2.25, 0.0, 0.7000) +
    safeArc(outerCounterRollPosition, 1.4805, LINE_WEIGHT * 2.25, PI, 0.7000);

  float outerBlueGlow =
    safeArc(rollLagPosition, 1.3021, LINE_WEIGHT * 2.55, 0.0, 0.6685) +
    safeArc(rollLagPosition, 1.3021, LINE_WEIGHT * 2.55, PI, 0.6685);

  finalCol = mix(finalCol, YELLOW,    clamp(outerWhiteGlow, 0.0, 1.0) * HUD_OUTER_WHITE_GLOW_ALPHA);
  finalCol = mix(finalCol, WHITE,     clamp(outerWhite,     0.0, 1.0) * HUD_OUTER_WHITE_ALPHA);

  finalCol = mix(finalCol, GREY_BLUE, clamp(outerBlueGlow,  0.0, 1.0) * HUD_OUTER_BLUE_GLOW_ALPHA);
  finalCol = mix(finalCol, BLUE,      clamp(outerBlue,      0.0, 1.0) * HUD_OUTER_BLUE_ALPHA);
  finalCol = mix(finalCol, GREEN,     clamp(outerCyan,      0.0, 1.0) * HUD_OUTER_CYAN_ALPHA);

  // Extra side brackets: brighter and slightly thicker.
  float sideBlue =
    safeArc(uv, 1.2574, LINE_WEIGHT * 1.30, 0.0, 0.5174) +
    safeArc(uv, 1.2574, LINE_WEIGHT * 1.30, PI, 0.5174) +
    safeArc(uv, 1.2574, LINE_WEIGHT * 1.30, HALF_PI, 0.5374) +
    safeArc(uv, 1.2574, LINE_WEIGHT * 1.30, -HALF_PI, 0.5374);

  float sideBlueGlow =
    safeArc(uv, 1.2574, LINE_WEIGHT * 2.10, 0.0, 0.5174) +
    safeArc(uv, 1.2574, LINE_WEIGHT * 2.10, PI, 0.5174) +
    safeArc(uv, 1.2574, LINE_WEIGHT * 2.10, HALF_PI, 0.5374) +
    safeArc(uv, 1.2574, LINE_WEIGHT * 2.10, -HALF_PI, 0.5374);

  finalCol = mix(finalCol, GREY_BLUE, clamp(sideBlueGlow, 0.0, 1.0) * HUD_SIDE_GLOW_ALPHA);
  finalCol = mix(finalCol, BLUE,      clamp(sideBlue,     0.0, 1.0) * HUD_SIDE_BLUE_ALPHA);

  // Outer dotted scale.
  for (int i = 0; i < 64; i++) {
    float fi = float(i);
    float a = -0.8324 * 0.5 + fi * (0.8324 / 63.0);

    vec2 p1 = vec2(cos(a), sin(a)) * 1.2800;
    vec2 p2 = -p1;

    float tick = safeDot(uv, p1, 0.0040) + safeDot(uv, p2, 0.0040);
    float tickGlow = safeDot(uv, p1, 0.0062) + safeDot(uv, p2, 0.0062);

    finalCol = mix(finalCol, GREY_BLUE, clamp(tickGlow, 0.0, 1.0) * HUD_OUTER_DOT_GLOW_ALPHA);
    finalCol = mix(finalCol, WHITE,     clamp(tick,     0.0, 1.0) * HUD_OUTER_DOT_ALPHA);
  }

  // Lower meter ticks.
  for (int i = 0; i < 36; i++) {
    float fi = float(i) / 35.0;
    float x = mix(-0.8500, 0.8500, fi);
    float tickHeight = mod(float(i), 5.0) < 0.5 ? 0.030 : 0.016;

    float tick = safeLine(
      uv,
      vec2(x, 0.6390 - tickHeight),
      vec2(x, 0.6390 + tickHeight),
      LINE_WEIGHT * 0.75
    );

    finalCol = mix(finalCol, GREY, tick * HUD_LOWER_TICK_ALPHA);
  }

  // Left / right altitude tapes.
  float altitudeMeters = max(0.0, uAltitudeMeters);
  float altitudeStepMeters = 20.0;
  float tapeSpacing = 0.050;
  float altitudeStepIndex = floor(altitudeMeters / altitudeStepMeters);
  float altitudeScroll = fract(altitudeMeters / altitudeStepMeters) * tapeSpacing;

  float tapeBaseX = 0.5550 + uAltitudeTapeOffset;

  for (int sideIndex = 0; sideIndex < 2; sideIndex++) {
    float side = sideIndex == 0 ? -1.0 : 1.0;

    float railX = side * tapeBaseX;
    float innerX = railX - side * 0.0850;
    float tapeTop = 0.4550;
    float tapeBottom = -0.4550;

    float rail =
      safeVerticalSegment(uv, railX, tapeBottom, tapeTop, LINE_WEIGHT * 0.90) +
      safeVerticalSegment(uv, innerX, tapeBottom, tapeTop, LINE_WEIGHT * 0.55);

    finalCol = mix(finalCol, BLUE, clamp(rail, 0.0, 1.0) * HUD_ALT_RAIL_ALPHA);

    float marker =
      safeHorizontalSegment(uv, 0.0, innerX, railX, LINE_WEIGHT * 1.15) +
      safeVerticalSegment(uv, innerX, -0.0400, 0.0400, LINE_WEIGHT * 0.95) +
      safeVerticalSegment(uv, railX, -0.0600, 0.0600, LINE_WEIGHT * 0.95);

    finalCol = mix(finalCol, GREEN, clamp(marker, 0.0, 1.0) * HUD_ALT_MARKER_ALPHA);

    for (int i = 0; i < 25; i++) {
      float fi = float(i) - 12.0;
      float y = fi * tapeSpacing - altitudeScroll;
      float tickIndex = altitudeStepIndex + fi;
      float majorTick = 1.0 - step(0.001, abs(mod(tickIndex, 5.0)));
      float tickLen = mix(0.0300, 0.0600, majorTick);

      float tick = safeHorizontalSegment(
        uv,
        y,
        railX - side * tickLen,
        railX,
        LINE_WEIGHT * mix(0.70, 0.95, majorTick)
      );

      float gate = 1.0 - smoothstep(0.4400, 0.4900, abs(y));

      finalCol = mix(
        finalCol,
        WHITE,
        clamp(tick * gate, 0.0, 1.0) * mix(HUD_ALT_TICK_MINOR_ALPHA, HUD_ALT_TICK_MAJOR_ALPHA, majorTick)
      );
    }
  }

  // Numeric telemetry readouts.
  float telemetryScale = 0.056;
  float telemetryStep = telemetryScale * 0.76;

  vec2 altStart = vec2(-0.6600, -0.5550);
  float altReadout =
    hudGlyphAt(uv, altStart + vec2(telemetryStep * 0.0, 0.0), telemetryScale, 0.0) +
    hudGlyphAt(uv, altStart + vec2(telemetryStep * 1.0, 0.0), telemetryScale, 1.0) +
    hudGlyphAt(uv, altStart + vec2(telemetryStep * 2.0, 0.0), telemetryScale, 2.0) +
    hudUnsignedInt5(uv, altStart + vec2(telemetryStep * 4.0, 0.0), telemetryScale, altitudeMeters);

  finalCol = mix(finalCol, GREEN, clamp(altReadout, 0.0, 1.0) * 0.950);

  vec2 rotationStart = vec2(0.4650, -0.5550);
  float rotationValue = mod(uCameraRotationDegrees + 360.0, 360.0);
  float rotationReadout =
    hudGlyphAt(uv, rotationStart + vec2(telemetryStep * 0.0, 0.0), telemetryScale, 5.0) +
    hudGlyphAt(uv, rotationStart + vec2(telemetryStep * 1.0, 0.0), telemetryScale, 6.0) +
    hudGlyphAt(uv, rotationStart + vec2(telemetryStep * 2.0, 0.0), telemetryScale, 2.0) +
    hudUnsignedInt3(uv, rotationStart + vec2(telemetryStep * 4.0, 0.0), telemetryScale, rotationValue);

  finalCol = mix(finalCol, BLUE, clamp(rotationReadout, 0.0, 1.0) * 0.950);

  // Center tiny lock point: direct mouse response.
  float centerDot = safeDot(directTargetPosition, vec2(0.0), 0.0075);
  finalCol = mix(finalCol, YELLOW, centerDot * HUD_CENTER_DOT_ALPHA);

  // Alpha from visible HUD luminance.
  float alpha = max(max(finalCol.r, finalCol.g), finalCol.b);

  // Subtle HUD pulse. Very cheap: no extra geometry.
  float pulse = (1.0 - HUD_PULSE_AMOUNT) + HUD_PULSE_AMOUNT * sin(iTime * 1.8);
  finalCol.rgb *= pulse;

  finalCol.a = clamp(alpha * uHudOpacity, 0.0, 1.0);

  gl_FragColor = finalCol;
}

`;

export class HudOverlayMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        iResolution: { value: new THREE.Vector2(1, 1) },
        iTime: { value: 0 },
        uTargetOffset: { value: new THREE.Vector2(0, 0) },
        uLagOffset: { value: new THREE.Vector2(0, 0) },
        uHudScale: { value: 0.5 },
        uHudOpacity: { value: 0.9 },
        uAltitudeMeters: { value: 0 },
        uCameraRotationDegrees: { value: 0 },
        uRollLag: { value: 0 },
        uAltitudeTapeOffset: { value: 0.12 }
      },
      vertexShader: /* glsl */`
        void main() {
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: HUD_FRAGMENT_SHADER
    });

    this.lastUpdateTime = 0;
    this.lastRawRoll = 0;
    this.rollTargetUnwrapped = 0;
    this.rollLag = 0;
  }

  setResolution(width, height, pixelRatio = 1) {
    this.uniforms.iResolution.value.set(
      Math.max(1, width * pixelRatio),
      Math.max(1, height * pixelRatio)
    );
  }

  updateHud({
    timeSeconds = 0,
    targetOffset = { x: 0, y: 0 },
    lagOffset = targetOffset,
    altitudeMeters = 0,
    cameraRotationDegrees = 0,
    altitudeTapeOffset = 0.12,
    rollRadians = 0,
    opacity = 0.9,
    scale = 1.0
  } = {}) {
    const dt = this.lastUpdateTime > 0
      ? Math.min(0.1, Math.max(1 / 240, timeSeconds - this.lastUpdateTime))
      : 1 / 60;

    if (this.lastUpdateTime <= 0) {
      this.lastRawRoll = rollRadians;
      this.rollTargetUnwrapped = rollRadians;
      this.rollLag = rollRadians;
    }

    this.lastUpdateTime = timeSeconds;

    const rawDelta = Math.atan2(
      Math.sin(rollRadians - this.lastRawRoll),
      Math.cos(rollRadians - this.lastRawRoll)
    );

    this.rollTargetUnwrapped += rawDelta;
    this.lastRawRoll = rollRadians;
    this.rollLag += (this.rollTargetUnwrapped - this.rollLag) * (1.0 - Math.exp(-4.5 * dt));

    const clampPoint = (point, radius = 1.18) => {
      const x = Number(point?.x ?? 0);
      const y = Number(point?.y ?? 0);
      const length = Math.hypot(x, y);

      if (length <= radius || length <= 0.00001) {
        return { x, y };
      }

      const s = radius / length;
      return { x: x * s, y: y * s };
    };

    const target = clampPoint(targetOffset);
    const lag = clampPoint(lagOffset);

    this.uniforms.iTime.value = timeSeconds;
    this.uniforms.uTargetOffset.value.set(target.x, target.y);
    this.uniforms.uLagOffset.value.set(lag.x, lag.y);
    this.uniforms.uHudScale.value = Math.max(0.1, scale) * 0.5;
    this.uniforms.uHudOpacity.value = Math.max(0, Math.min(1, opacity));
    this.uniforms.uAltitudeMeters.value = Math.max(0, altitudeMeters);
    this.uniforms.uCameraRotationDegrees.value = Number.isFinite(cameraRotationDegrees)
      ? ((cameraRotationDegrees % 360) + 360) % 360
      : 0;
    this.uniforms.uRollLag.value = this.rollLag;
    this.uniforms.uAltitudeTapeOffset.value = Math.max(0, altitudeTapeOffset);
  }
}
