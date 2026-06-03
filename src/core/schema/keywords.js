import moment from 'moment'

export const isNotEmpty = {
    type: 'string',
    keyword: 'isNotEmpty',
    validate: function (schema, data) {
        return typeof data === 'string' && data.trim() !== ''
    }
}

export const birthDate = {
    type: 'string',
    keyword: 'birthDate',
    validate: function (schema, data) {
        const inputDate = moment(data, 'DD-MM-YYYY')
        const minDate = moment().clone().subtract(5, 'years').startOf('d')
        return inputDate.clone().isSameOrBefore(minDate)
    }
}


export const customTime = {
    type: 'string',
    keyword: 'customTime',
    validate: function (schema, data) {
        return moment(data, 'hh:mm A', true).isValid()
    }
}
