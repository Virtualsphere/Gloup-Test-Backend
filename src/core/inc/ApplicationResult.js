export class ApplicationResult {
    constructor(type, { resource, data }, message) {
        this.result = {
            message,
            resource,
            data,
            type: ApplicationResult.getType(data),
        };
        this.type = type;
    }
    static getType(data) {
        if (data instanceof Array) return "list";
        else if (data instanceof Object) return "object";
        else if (data instanceof String) return "string";
        else if (data instanceof Boolean) return "boolean";
        else return "typeUnknown";
    }
}