import { Layer, project32, picking, fp64LowPart } from '@deck.gl/core'
import { BitmapLayerProps } from '@deck.gl/layers'
import { Texture2D } from '@luma.gl/core'
import { Model, Geometry } from '@luma.gl/engine'
import vs from './multi-bitmap-layer-vertex.glsl'
import fs from './multi-bitmap-layer-fragment.glsl'

/**
 * MultiBitmapLayer - A custom deck.gl layer that renders the same texture
 * across multiple geographical bounds efficiently.
 * 
 * This layer uses deck.gl accessor patterns and supports multiple instances
 * of the same texture without loading it multiple times.
 */
export default class MultiBitmapLayer<T, P extends BitmapLayerProps<T>> extends Layer<T, P> {
  static layerName = 'MultiBitmapLayer'

  static defaultProps = {
    // Data and accessors
    data: { type: 'data', value: [] },
    getBounds: { type: 'accessor', value: (d) => d.bounds },
    
    // Single image/texture to be used across all bounds
    image: { type: 'object', value: null, async: true },
    
    // Visual properties
    opacity: { type: 'number', value: 1, min: 0, max: 1 },
    desaturate: { type: 'number', value: 0, min: 0, max: 1 },
    transparentColor: { type: 'color', value: [0, 0, 0, 0] },
    tintColor: { type: 'color', value: [255, 255, 255] },
    alphaCutoff: {type: 'number', value: 0.05, min: 0, max: 1},
  }

  abortController?: AbortController

  handleAbortController(loadOptions) {
    if (this.abortController) this.abortController.abort()
    this.abortController = new AbortController()
    loadOptions.signal = this.abortController.signal
  }

  initializeState() {
    const attributeManager = this.getAttributeManager()
    
    // Bounds as 4 corners: [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]
    // Corner order (matching deck.gl BitmapLayer): 0=bottomLeft, 1=topLeft, 2=topRight, 3=bottomRight
    // Split into two vec4 attributes: corners 0+1 and corners 2+3
    attributeManager.addInstanced({
      instanceBoundsA: {
        size: 4,
        type: 5126, // GL.FLOAT
        accessor: 'getBounds',
        transform: (bounds) => {
          if (!bounds || !bounds.length) return [0, 0, 0, 0]
          return [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]
        }
      },
      instanceBoundsB: {
        size: 4,
        type: 5126, // GL.FLOAT
        accessor: 'getBounds',
        transform: (bounds) => {
          if (!bounds || !bounds.length) return [0, 0, 0, 0]
          return [bounds[2][0], bounds[2][1], bounds[3][0], bounds[3][1]]
        }
      },
      // fp64 low parts of the corner coordinates. In Web Mercator the world
      // coordinates grow large at high zoom and float32 alone loses precision,
      // causing the overlay to drift/jitter. These carry the residual bits so
      // project_position_to_clipspace can do the origin subtraction in fp64.
      instanceBoundsA64Low: {
        size: 4,
        type: 5126, // GL.FLOAT
        accessor: 'getBounds',
        transform: (bounds) => {
          if (!bounds || !bounds.length) return [0, 0, 0, 0]
          return [
            fp64LowPart(bounds[0][0]), fp64LowPart(bounds[0][1]),
            fp64LowPart(bounds[1][0]), fp64LowPart(bounds[1][1])
          ]
        }
      },
      instanceBoundsB64Low: {
        size: 4,
        type: 5126, // GL.FLOAT
        accessor: 'getBounds',
        transform: (bounds) => {
          if (!bounds || !bounds.length) return [0, 0, 0, 0]
          return [
            fp64LowPart(bounds[2][0]), fp64LowPart(bounds[2][1]),
            fp64LowPart(bounds[3][0]), fp64LowPart(bounds[3][1])
          ]
        }
      }
    })
    
    this.setState({
      texture: null
    })
  }

  updateState({ props, oldProps, changeFlags, context }) {
    super.updateState({ props, oldProps, changeFlags, context })

    if (changeFlags.extensionsChanged || !this.state.model) {
      this.state.model?.delete()
      this.setState({ model: this._getModel(context.gl) })
    }

    if (changeFlags.dataChanged) {
      const numInstances = props.data ? props.data.length : 0
      if (this.state.model) {
        this.state.model.setInstanceCount(numInstances)
      }
    }

    // Load texture if image changed
    if (props.image !== oldProps.image && props.image) {
      this.loadTexture(props.image, props.loadOptions)
    }
  }

  async loadTexture(image, loadOptions) {
    if (!loadOptions.signal) this.handleAbortController(loadOptions)

    const { gl } = this.context
    
    let textureData = image
    
    // Handle different image input types
    if (typeof image === 'string') {
      // URL string
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = image
      })
      textureData = img
    }

    const texture = new Texture2D(gl, {
      data: textureData,
      parameters: {
        [gl.TEXTURE_MIN_FILTER]: gl.LINEAR_MIPMAP_LINEAR,
        [gl.TEXTURE_MAG_FILTER]: gl.LINEAR,
        [gl.TEXTURE_WRAP_S]: gl.CLAMP_TO_EDGE,
        [gl.TEXTURE_WRAP_T]: gl.CLAMP_TO_EDGE
      },
      mipmaps: true
    })

    this.setState({ texture })
  }

  getShaders() {
    const shaders = super.getShaders({modules: [project32, picking]})
    
    return { ...shaders, vs, fs }
  }

  draw({ uniforms }) {
    const { texture, model } = this.state
    const { 
      desaturate, 
      transparentColor, 
      tintColor,
      opacity,
      data
    } = this.props

    if (!texture || !model || !data) {
      return
    }

    model.setUniforms({
      ...uniforms,
      bitmapTexture: texture,
      desaturate: desaturate || 0,
      transparentColor: transparentColor!.map((x) => x! / 255),
      tintColor: tintColor!.slice(0, 3).map((x) => x / 255),
      opacity: opacity !== undefined ? opacity : 1.0
    })

    model.draw()
  }

  _getModel(gl) {
    // Simple quad geometry
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0
    ])

    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      1, 0,
      0, 0
    ])

    const indices = new Uint16Array([0, 1, 2, 0, 2, 3])

    return new Model(gl, {
      ...this.getShaders(),
      id: this.props.id,
      geometry: new Geometry({
        drawMode: 4, // GL.TRIANGLES
        attributes: {
          positions: { size: 3, value: positions },
          texCoords: { size: 2, value: texCoords }
        },
        indices
      }),
      isInstanced: true
    })
  }
}
