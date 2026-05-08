 
import {Expose, Transform} from 'class-transformer'
import { EncodingScope } from '@hopara/encoding'
import {Actions} from '../action/Actions'
import {Legends} from '../legend/Legends'
import { Lights } from '../lights/Lights'
import {AutoNavigation} from '../auto-navigation/AutoNavigation'

export enum VisualizationType {
  GEO = 'GEO',
  CHART = 'CHART',
  THREE_D = '3D',
  WHITEBOARD = 'WHITEBOARD',
  ISOMETRIC_WHITEBOARD = 'ISOMETRIC_WHITEBOARD',
}

class Visualization {
  @Transform(({value}) => value.toString())

  // The expose is because of the excludeExtraneousValues on the parse which cleans up the visualization
  @Expose() id: string
  @Expose() type: VisualizationType
  @Expose() name: string
  @Expose() encodingScope: EncodingScope
  @Expose() autoNavigation?: AutoNavigation
  @Expose() group?: string
  @Expose() $schema?: string
  @Expose() createdVersion?: string
  @Expose() actions: Actions
  @Expose() refreshPeriod?: number
  @Expose() scope?: string
  @Expose() lights?: Lights
  @Expose() historyBack?: boolean
  @Expose() animationFps?: number
  @Expose() bleedFactor: number
  @Expose() backgroundColor?: string


  @Transform(({value}) => value ?? [], {toClassOnly: true})
  @Expose() legends: Legends

  constructor(props?:Partial<Visualization>) {
    Object.assign(this, props)

    if ( !this.scope ) {
      this.scope = this.id
    }
  }

  hasType(): boolean {
    return !!this.type
  }

  isGeo():boolean {
    return this.type === VisualizationType.GEO
  }

  isChart(): boolean {
    return this.type === VisualizationType.CHART
  }

  is3D(): boolean {
    return this.type === VisualizationType.THREE_D
  }

  isWhiteboard(): boolean {
    return this.type === VisualizationType.WHITEBOARD || this.type === VisualizationType.ISOMETRIC_WHITEBOARD
  }

  isFetchScope(): boolean {
    return this.encodingScope === EncodingScope.FETCH
  }

  getName() {
    return this.name ?? `Visualization ${this.id}`
  }

  showAttribution() {
    return !this.isChart()
  }

  immutableUpdateActions(actions: Actions) {
    const cloned = new Visualization(this)
    cloned.actions = actions
    return cloned
  }

  immutableUpdate(change: Partial<Visualization>) {
    const cloned = new Visualization(this)
    Object.assign(cloned, change)
    return cloned
  }
}

export default Visualization
