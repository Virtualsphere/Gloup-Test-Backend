import Ajv from 'ajv'
import {
    createRequire
} from 'module'
import {
    schemaFormats
} from './formats.js'
import * as keywords from './keywords.js'
import * as schema from './schema.js'

const require = createRequire(
    import.meta.url)
// const Ajv = require('ajv/dist/2019')

export const ajv = new Ajv.default({
    allErrors: true,
    removeAdditional: true,
    validateFormats: true,
    ownProperties: true,
    allowUnionTypes: true,
    messages: true,
    verbose: true,
    $data: true,
    formats: {
        reserved: true,
        ...schemaFormats
    },
    schemas: [require('./defs.json'), Object.values(schema)],
    strict: true
})
require('ajv-formats')(ajv)

Object.keys(keywords).map(item => {
    return ajv.addKeyword(keywords[item])
})

