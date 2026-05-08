import {ColumnType, formatValue as columnTypeFormatValue, geti} from '@hopara/dataset'
import {Logger} from '@hopara/internals'
import {isNil} from 'lodash/fp'
import {format, timeFormat} from 'd3'
import {BaseEncoding} from '../BaseEncoding'
import { Condition } from '../condition/Condition'
import { isEmpty } from 'lodash'

export enum Alignment {
  LEFT = 'left',
  CENTER = 'center',
  RIGHT = 'right'
}

type SuffixEncoding = {
  field?: string,
  value?: string
}

export enum MaxLengthType {
  FIXED = 'FIXED',
  AUTO = 'AUTO',
  NONE = 'NONE'
}

type MaxLength = {
  value?: number,
  type?: MaxLengthType
}

export type TextCondition = Condition & Partial<TextEncoding>

export class TextEncoding extends BaseEncoding<TextEncoding> {
  field?: string
  align?: Alignment
  angle?: number
  suffix?: SuffixEncoding
  prefix?: SuffixEncoding
  maxLength?: MaxLength
  format?: string
  weight?: string
  value?:string
  map?: Record<any, string>
  conditions?: TextCondition[]

  constructor(props?: Partial<TextEncoding>) {
    super()
    Object.assign(this, props)
  }

  hasCondition(): boolean {
    return !isEmpty(this.conditions)
  }

  getField(): string | undefined {
    return this.field
  }

  getWeight(): string | undefined {
    return this.weight
  }

  getMaxLength(): number | undefined {
    return this.maxLength?.value
  }

  getAnchor(): string {
    switch (this.align) {
      case 'left':
        return 'start'
      case 'right':
        return 'end'
      default:
        return 'middle'
    }
  }

  getAngle(): number {
    return this.angle ?? 0
  }

  formatValue(value: any, columnType?: ColumnType): string {
    if (this.format) {
      try {
        if (columnType === ColumnType.DATETIME) {
          return timeFormat(this.format)(value)
        } else {
          return format(this.format)(value)
        }
      } catch {
        Logger.error(new Error(`Error formatting column\ncolumnType: ${columnType}\nvalue: ${value}\nformat: ${this.format}`))
        return value
      }
    }

    return columnTypeFormatValue(value, columnType)
  }

  getSuffixValue(row: any, encoding: SuffixEncoding | undefined, opts: {prefixSeparator?: string, suffixSeparator?: string}) {
    if (!encoding) {
      return ''
    }

    if (encoding.field && row[encoding.field]) {
      return (opts.suffixSeparator ?? '') + row[encoding.field] + (opts.prefixSeparator ?? '')
    }

    if (encoding.value) {
      return encoding.value
    } 
    
    return ''
  }

  getValue(row: any, columnType?: ColumnType) {
    let value = geti(this.getField(), row)
    if (isNil(value)) {
      if ( isNil(this.value)) {
        return undefined
      }

      value = this.value
    }

    if (this.map && !isNil(geti(value, this.map))) {
      value = geti(value, this.map)
    }

    value = this.formatValue(value, columnType)
    
    const maxLength = this.maxLength?.value
    if (!isNil(maxLength) && maxLength > 0 && value.length > maxLength) {
      if (this.maxLength?.type === MaxLengthType.FIXED) {
        value = value.substring(0, maxLength)
        value += '…'
      }
    }

    value = this.getSuffixValue(row, this.prefix, {prefixSeparator: ' '}) + value
    value = value + this.getSuffixValue(row, this.suffix, {suffixSeparator: ' '}) 
    value = value.replace(/\\n/g, '\n')

    return value
  }

  isRenderable(): boolean {
    return !!this.field || !!this.value
  }
}
