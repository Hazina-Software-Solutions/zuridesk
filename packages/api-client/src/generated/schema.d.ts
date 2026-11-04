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
    "/v1/booking-locations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
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
                            locations: {
                                id: string;
                                name: string;
                                timezone: string;
                            }[];
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
    "/v1/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
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
                            services: {
                                id: string;
                                name: string;
                                description: string | null;
                            }[];
                        };
                    };
                };
            };
        };
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
                        name: string;
                        description?: string | null;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            name: string;
                            description: string | null;
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
    "/v1/services/{serviceId}": {
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
                    serviceId: string;
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
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    serviceId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name?: string;
                        description?: string | null;
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
                            id: string;
                            name: string;
                            description: string | null;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/v1/locations/{locationId}/booking-catalogue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    locationId: string;
                };
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
                            locationId: string;
                            services: {
                                id: string;
                                name: string;
                                description: string | null;
                                offering: {
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    slotIncrementMinutes: number;
                                    minAdvanceMinutes: number;
                                    maxAdvanceDays: number;
                                };
                                eligibleStaff: {
                                    id: string;
                                    displayName: string;
                                }[];
                            }[];
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
    "/v1/booking-availability/query": {
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
                        locationId: string;
                        localDate: string;
                        selections: {
                            serviceId: string;
                            assignedStaffProfileId: string;
                        }[];
                        limit?: number;
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
                            locationId: string;
                            localDate: string;
                            timezone: string;
                            /** Format: date-time */
                            evaluatedAt: string;
                            guardVersions: {
                                /** @enum {string} */
                                scopeType: "location" | "staff";
                                scopeId: string;
                                version: number;
                            }[];
                            slots: {
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    assignedStaffProfileId: string;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** Format: date-time */
                                    bufferedStartsAt: string;
                                    /** Format: date-time */
                                    bufferedEndsAt: string;
                                }[];
                            }[];
                            reasons: ("LOCATION_UNAVAILABLE" | "SERVICE_UNAVAILABLE" | "STAFF_UNAVAILABLE" | "SCHEDULE_UNCONFIGURED" | "NO_CAPACITY")[];
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
    "/v1/bookings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    status?: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                    locationId?: string;
                    localDateFrom?: string;
                    localDateTo?: string;
                    limit?: number;
                };
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
                            bookings: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            }[];
                        };
                    };
                };
            };
        };
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
                        idempotencyKey: string;
                        locationId: string;
                        /** @enum {string} */
                        source: "appointment" | "walk_in";
                        /**
                         * @default confirmed
                         * @enum {string}
                         */
                        status?: "pending" | "confirmed";
                        guest: {
                            /** @enum {string} */
                            kind: "named" | "anonymous";
                            displayName: string;
                            phone?: string;
                            /** Format: email */
                            email?: string;
                            /** @enum {string|null} */
                            customerId: null;
                        };
                        selections: {
                            serviceId: string;
                            assignedStaffProfileId: string;
                        }[];
                        startsAt?: unknown;
                    };
                };
            };
            responses: {
                /** @description Default Response */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    bookingId: string;
                };
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
                            id: string;
                            locationId: string;
                            localDate: string;
                            timezone: string;
                            /** Format: date-time */
                            startsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                            /** @enum {string} */
                            status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                            version: number;
                            /** @enum {string} */
                            source: "appointment" | "walk_in";
                            guest: {
                                /** @enum {string} */
                                kind: "named" | "anonymous";
                                displayName: string;
                                phone?: unknown;
                                email?: unknown;
                                /** @enum {string|null} */
                                customerId: null;
                            };
                            lines: {
                                order: number;
                                serviceId: string;
                                serviceName: string;
                                assignedStaffProfileId: string;
                                durationMinutes: number;
                                bufferBeforeMinutes: number;
                                bufferAfterMinutes: number;
                                quotedPriceMinor: number;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "scheduled" | "in_progress" | "completed" | "skipped";
                                skippedReasonCode: string | null;
                            }[];
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
    "/v1/bookings/{bookingId}/confirm": {
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
                path: {
                    bookingId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/reschedule": {
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
                path: {
                    bookingId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
                        /** @enum {string} */
                        reasonCode: "guest_request" | "staff_unavailable" | "business_disruption" | "scheduling_correction" | "other";
                        note?: string;
                        startsAt: unknown;
                        selections: {
                            serviceId: string;
                            assignedStaffProfileId: string;
                        }[];
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/start": {
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
                path: {
                    bookingId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/complete": {
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
                path: {
                    bookingId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/no-show": {
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
                path: {
                    bookingId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
                        /** @enum {string} */
                        reasonCode: "guest_absent" | "unable_to_contact";
                        note?: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/cancel": {
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
                path: {
                    bookingId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
                        /** @enum {string} */
                        reasonCode: "guest_request" | "staff_unavailable" | "business_disruption" | "duplicate" | "other";
                        note?: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/lines/{lineOrder}/start": {
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
                path: {
                    bookingId: string;
                    lineOrder: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/lines/{lineOrder}/complete": {
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
                path: {
                    bookingId: string;
                    lineOrder: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
    "/v1/bookings/{bookingId}/lines/{lineOrder}/skip": {
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
                path: {
                    bookingId: string;
                    lineOrder: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        expectedVersion: number;
                        idempotencyKey: string;
                        /** @enum {string} */
                        reasonCode: "guest_declined" | "service_unavailable" | "staff_decision" | "safety_concern" | "other";
                        note?: string;
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
                            replay: boolean;
                            booking: {
                                id: string;
                                locationId: string;
                                localDate: string;
                                timezone: string;
                                /** Format: date-time */
                                startsAt: string;
                                /** Format: date-time */
                                endsAt: string;
                                /** @enum {string} */
                                status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
                                version: number;
                                /** @enum {string} */
                                source: "appointment" | "walk_in";
                                guest: {
                                    /** @enum {string} */
                                    kind: "named" | "anonymous";
                                    displayName: string;
                                    phone?: unknown;
                                    email?: unknown;
                                    /** @enum {string|null} */
                                    customerId: null;
                                };
                                lines: {
                                    order: number;
                                    serviceId: string;
                                    serviceName: string;
                                    assignedStaffProfileId: string;
                                    durationMinutes: number;
                                    bufferBeforeMinutes: number;
                                    bufferAfterMinutes: number;
                                    quotedPriceMinor: number;
                                    /** Format: date-time */
                                    startsAt: string;
                                    /** Format: date-time */
                                    endsAt: string;
                                    /** @enum {string} */
                                    status: "scheduled" | "in_progress" | "completed" | "skipped";
                                    skippedReasonCode: string | null;
                                }[];
                            };
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
