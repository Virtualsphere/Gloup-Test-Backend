import {
    ApplicationError
} from '../../errors/ApplicationError.js'

export class ApplicationResponse {
    constructor(type, data, info) {
        if (type === 'error') {
            this.ExceptionSet(data)
            this.error = {
                ...data,
                ...info
            }
        } else {
            this.SuccessSet(data)
            this.response = {
                ...data.result,
                ...info
            }
        }
    }
    static success(data, info, cb) {
        const success = new this('success', data, info)
        return cb ? cb(success) : success
    }
    static error(data, info, cb) {
        const error = new this('error', ApplicationError.create(data), info)
        return cb ? cb(error) : error
    }
    ExceptionSet(data) {
        this.status = data.status || DefaultResponseCodes.error.status
    }
    SuccessSet(data) {
        this.status = data.status || DefaultResponseCodes.success.status
    }
}

const DefaultResponseCodes = {
    error: {
        status: 400
    },
    success: {
        status: 200
    }
}