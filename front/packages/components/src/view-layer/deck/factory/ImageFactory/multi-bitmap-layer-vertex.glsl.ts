export default `\
#define SHADER_NAME multi-bitmap-layer-vertex-shader

attribute vec3 positions;
attribute vec2 texCoords;
attribute vec3 instancePickingColors;
// 4 corners split into 2 vec4s:
// A = (corner0.x, corner0.y, corner1.x, corner1.y)
// B = (corner2.x, corner2.y, corner3.x, corner3.y)
// Corner order: 0=bottomLeft, 1=topLeft, 2=topRight, 3=bottomRight
attribute vec4 instanceBoundsA;
attribute vec4 instanceBoundsB;
// fp64 low parts of the corner coordinates (same layout as instanceBoundsA/B)
attribute vec4 instanceBoundsA64Low;
attribute vec4 instanceBoundsB64Low;

uniform float opacity;

varying vec2 vTexCoord;
varying float vOpacity;

void main(void) {
  vec2 c0 = instanceBoundsA.xy;  // bottomLeft
  vec2 c1 = instanceBoundsA.zw;  // topLeft
  vec2 c2 = instanceBoundsB.xy;  // topRight
  vec2 c3 = instanceBoundsB.zw;  // bottomRight

  // fp64 low parts of the same corners
  vec2 c0Low = instanceBoundsA64Low.xy;
  vec2 c1Low = instanceBoundsA64Low.zw;
  vec2 c2Low = instanceBoundsB64Low.xy;
  vec2 c3Low = instanceBoundsB64Low.zw;

  // Bilinear interpolation matching deck.gl BitmapLayer create-mesh:
  // lerp(lerp(c0, c1, v), lerp(c3, c2, v), u)
  float u = positions.x;
  float v = positions.y;
  vec2 left = mix(c0, c1, v);
  vec2 right = mix(c3, c2, v);
  vec2 pos2d = mix(left, right, u);

  // mix is linear, so the low parts interpolate with the same weights
  vec2 leftLow = mix(c0Low, c1Low, v);
  vec2 rightLow = mix(c3Low, c2Low, v);
  vec2 pos2dLow = mix(leftLow, rightLow, u);

  geometry.worldPosition = vec3(pos2d, 0.0);
  geometry.uv = texCoords;
  geometry.pickingColor = instancePickingColors;

  gl_Position = project_position_to_clipspace(geometry.worldPosition, vec3(pos2dLow, 0.0), vec3(0.0), geometry.position);
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  vTexCoord = texCoords;
  vOpacity = opacity;

  vec4 color = vec4(0.0);
  DECKGL_FILTER_COLOR(color, geometry);
}
`
