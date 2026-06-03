import {
    SchemaError
} from '../../errors/SchemaError.js'
import {
    ajv
} from '../../schema/ajv.js'

export class PayloadCompiler {
    constructor(data) {
        this.data = data
    }
    static async compile(data, method) {
        const compiler = new this(data)
        return await compiler.__init(method)
    }
    async __init(method) {
        const schema = ajv.getSchema(method)
        if (!schema(this.data)) {
            throw new SchemaError(schema.errors, this.data)
        } else return this
    }
}