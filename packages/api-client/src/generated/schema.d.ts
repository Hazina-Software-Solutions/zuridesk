/** Generated from apps/api/openapi/openapi.json. Do not edit manually. */
export interface paths {
    "/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Process liveness */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            service: "zuridesk-api";
                            /** Format: date-time */
                            timestamp: string;
                            requestId: string;
                            /** @enum {string} */
                            status: "ok";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Required dependency readiness */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            service: "zuridesk-api";
                            /** Format: date-time */
                            timestamp: string;
                            requestId: string;
                            /** @enum {string} */
                            status: "ok" | "not_ready";
                            dependencies: {
                                /** @enum {string} */
                                mongodb: "up" | "down";
                            };
                        };
                    };
                };
                /** @description Default Response */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            service: "zuridesk-api";
                            /** Format: date-time */
                            timestamp: string;
                            requestId: string;
                            /** @enum {string} */
                            status: "ok" | "not_ready";
                            dependencies: {
                                /** @enum {string} */
                                mongodb: "up" | "down";
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/signup/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            accepted: true;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/signup/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                        /** Format: email */
                        email: string;
                        password: string;
                        displayName: string;
                        tenantName: string;
                        locationName: string;
                        /** @default Africa/Nairobi */
                        timezone?: string;
                        /** @enum {string} */
                        transport: "web" | "mobile";
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        } | {
                            accessToken: string;
                            refreshToken?: string;
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        password: string;
                        /** @enum {string} */
                        transport: "web" | "mobile";
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        } | {
                            accessToken: string;
                            refreshToken?: string;
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        refreshToken?: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        } | {
                            accessToken: string;
                            refreshToken?: string;
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/password/forgot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            accepted: true;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/password/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                        /** Format: email */
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": null;
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/invitations/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                        displayName?: string;
                        password?: string;
                        /** @enum {string} */
                        transport: "web" | "mobile";
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        } | {
                            accessToken: string;
                            refreshToken?: string;
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": null;
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/tenants/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        tenantId: string;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        } | {
                            accessToken: string;
                            refreshToken?: string;
                            csrfToken?: string;
                            /** @enum {number} */
                            expiresInSeconds: 600;
                            user: {
                                id: string;
                                displayName: string;
                            };
                            activeTenantId: string | null;
                            tenants: {
                                id: string;
                                name: string;
                                roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                            }[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/invitations/{inviteId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    inviteId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": null;
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        roleKeys: ("owner" | "manager" | "receptionist" | "stylist")[];
                        /** @default false */
                        resend?: boolean;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            accepted: true;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/memberships/{membershipId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    membershipId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        roleKeys?: ("owner" | "manager" | "receptionist" | "stylist")[];
                        /** @enum {string} */
                        status?: "active" | "suspended" | "revoked";
                    };
                };
            };
            responses: {
                /** @description Default Response */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": null;
                    };
                };
            };
        };
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
