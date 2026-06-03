import {
    SchemaError
} from './SchemaError.js';

export class ApplicationError extends Error {
    constructor(expn, ...params) {
        super(...params)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ApplicationError)
        }
        if (expn instanceof SchemaError) {
            this.type = expn && expn.type ? expn.type : 'ClientException'
            if (expn.errors instanceof Array) {
                this.errors = expn.errors;
            } else {
                const err = expn.errors[0];
                this.code = err.code && err.code ? err.code : 'schema/invalid';
                this.message = err.message ? err.message : 'Schema Invalid!';
                this.description = err.description ? err.description : null;
            }
        } else {
            this.type = expn && expn.type ? expn.type : 'ServerError'
            this.code = expn && expn.code ? expn.code : 'server/malfunction'
            this.message = expn && expn.message ? expn.message : 'Server Malfunction!'
            this.description = expn && expn.description ? expn.description : null
        }
    }
    static prepare(type, error = ({ code, message, description } = {})) {
       return new this({type,...error})
    }
    static create(error, cb) {
        const instance = error instanceof ApplicationError ? error : new this(error)
        return cb ? cb(instance) : instance
    }
}