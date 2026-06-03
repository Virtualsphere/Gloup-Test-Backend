const User = {
    properties: {
        id: {
            $ref: "defs#/definitions/User/id",
        },
        firstname: {
            $ref: "defs#/definitions/User/firstname",
        },
        lastname: {
            $ref: "defs#/definitions/User/lastname",
        },
        phone: {
            $ref: "defs#/definitions/User/phone",
        },
        email: {
            $ref: "defs#/definitions/User/email",
        },
        password: {
            $ref: "defs#/definitions/User/password",
        },
        otp: {
            $ref: "defs#/definitions/User/otp",
        },
        optExpiration: {
            $ref: "defs#/definitions/User/optExpiration",
        },
        date_of_birth: {
            $ref: "defs#/definitions/User/date_of_birth",
        },
        city: {
            $ref: "defs#/definitions/User/city",
        },
        invited_code: {
            $ref: "defs#/definitions/User/invited_code",
        },
        used_code: {
            $ref: "defs#/definitions/User/used_code",
        },
        wallet: {
            $ref: "defs#/definitions/User/wallet",
        },
        profilePic: {
            $ref: "defs#/definitions/User/profilePic",
        },
        status: {
            $ref: "defs#/definitions/User/status",
        },
    },
};


export const otpLogin = {
    type: "object",
    $id: "otpLogin",
    additionalProperties: false,
    properties: {
        phone: User.properties.phone,
    },
    required: ["phone"],
};

//Schema to validate the request body for creating a hire student.
export const createHireStudent = {
    type: "object",
    $id: "createHireStudent",
    additionalProperties: false,
    properties: {
        name: { $ref: "defs#/definitions/HireStudent/name" },
        specialization: { $ref: "defs#/definitions/HireStudent/specialization" },
        academy: { $ref: "defs#/definitions/HireStudent/academy" },
        experience: { $ref: "defs#/definitions/HireStudent/experience" },
        location: { $ref: "defs#/definitions/HireStudent/location" },
        availability: { $ref: "defs#/definitions/HireStudent/availability" },
        rating: { $ref: "defs#/definitions/HireStudent/rating" },
        bio: { $ref: "defs#/definitions/HireStudent/bio" },
        skills: { $ref: "defs#/definitions/HireStudent/skills" },
        mobile_number: { $ref: "defs#/definitions/HireStudent/mobile_number" }
    },
    required: ["name", "specialization", "academy", "experience", "location", "availability", "skills", "mobile_number"],
};
