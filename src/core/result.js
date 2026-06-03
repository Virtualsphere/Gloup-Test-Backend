export class ApplicationResult {
    constructor(type, { resource, data }, message) {
        this.result = {
            message,
            resource,
            type: ApplicationResult.getType(data),
            data,
        };
        this.type = type;
    }
    static forCreated(resource, data, message) {
        const instance = new this(
            "Created", {
                resource,
                data,
            },
            message
        );
        return instance;
    }
    static forSuccess(resource, data, message) {
        const instance = new this(
            "Success", {
                resource,
                data,
            },
            message
        );
        return instance;
    }
    static forUpdated(resource, data, message) {
        const instance = new this(
            "Updated", {
                resource,
                data,
            },
            message
        );
        return instance;
    }
    static create(result, cb) {
        const instance =
            result instanceof ApplicationResult ? result : new this(result);
        return cb ? cb(instance) : instance;
    }
    static forAccepted(resource, data, message) {
        const instance = new this(
            "Accepted", {
                resource,
                data,
            },
            message
        );
        return instance;
    }
    static getType(data) {
        if (data instanceof Array) return "list";
        else if (data instanceof Object) return "object";
        else if (data instanceof String) return "string";
        else if (data instanceof Boolean) return "boolean";
        else return "unknown";
    }
}