import errorProperties from 'err-code'
import capitalize from 'lodash/capitalize.js'
import {
    ApplicationError
} from './ApplicationError.js'

export const NotFound = (name, description) => {
    return errorProperties(ApplicationError.prepare('NotFoundException', {
        code: `${name}-not-found`,
        message: `${capitalize(name)} Not Found`,
        description
    }))
}

export const NotSaved = (name, description) => {
    return errorProperties(ApplicationError.prepare('NotSavedException', {
        code: `${name}-not-${description}`,
        message: `${capitalize(name)} Not ${capitalize(description)}`
    }))
}

export const NotValid = (name, description) => {
    return errorProperties(ApplicationError.prepare('NotValidException', {
        code: `${name}-not-valid`,
        message: description
    }))
}
export const AuthenticationFailed = (msg = 'Authentication Failed') => {
    return errorProperties(ApplicationError.prepare('UnauthorizedException', {
        code: 'Authentication Failed',
        message: msg
    }))
}

export const AlreadyExists = (name, description) => {
    return errorProperties(ApplicationError.prepare('ConflictException', {
        code: `Already Exists`,
        message: `${capitalize(name)} Already Exists`,
        description
    }))
}

export const FileLimit = (name, description) => {
    return errorProperties(ApplicationError.prepare('TooLargeException', {
        code: `${name}-toolarge`,
        message: `${capitalize(name)} Too Large`,
        description
    }))
}

export const SomethingWentWrong = (msg = "Something Went Wrong", description) => {
    return errorProperties(ApplicationError.prepare('ServerException', {
        code: 'Something-went-wrong',
        message: msg,
        description
    }))
}
export const InternalError = (msg = "Internal Server Error", description) => {
    return errorProperties(ApplicationError.prepare('ServerException', {
        code: 'Internal-Server-Error',
        message: msg,
        description
    }))
}

export const CustomError = description => {
    return errorProperties(ApplicationError.prepare('ClientException', {
        code: 'client/custom-error',
        message: 'Custom Error',
        description
    }))
}
export const BadRequest = (msg = "Bad Request", description) => {
    return errorProperties(ApplicationError.prepare('ClientException', {
        code: 'bad-request',
        message: msg,
        description
    }))
}
