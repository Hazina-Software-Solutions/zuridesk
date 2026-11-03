export {
  checkDatabaseHealth,
  connectDatabase,
  disconnectDatabase,
  type DatabaseConnectionOptions,
  type DatabaseHealth
} from "./connection";
export { type TrustedTenantContext } from "./context/tenant-context";
export { DatabaseCommandError, type DatabaseCommandErrorCode } from "./commands/errors";
export {
  acceptInvite,
  administerMembership,
  clearActiveTenant,
  consumePasswordReset,
  consumeRateLimit,
  createAuthChallenge,
  createSession,
  findAuthIdentityByEmail,
  getActiveSession,
  getAuthChallengeSubjectKeyVersion,
  getAuthenticationUser,
  getRefreshSession,
  issueOrResendInvite,
  listAuthorizedTenants,
  prevalidateAuthChallenge,
  prevalidateInvite,
  recordSecurityEvent,
  rehashIdentityPassword,
  registerVerifiedOwner,
  revokeAllUserSessions,
  revokeInvite,
  revokeSession,
  rotateSession,
  selectActiveTenant,
  verifyLiveTenantAccess
} from "./commands/phase3-commands";
export type {
  InviteDto,
  InviteRecipientDto,
  InviteStatus,
  LocationDto,
  LocationStatus,
  MembershipDto,
  MembershipStatus,
  MembershipWithUserDto,
  RoleKey,
  TenantDto,
  TenantStatus,
  UserDto,
  UserStatus
} from "./repositories/identity-types";
export {
  bookingConcurrencyRepository,
  bookingConfigurationRepository,
  bookingScheduleRepository,
  bookingReadRepository,
  serviceCatalogueRepository,
  staffBookingProfileRepository,
  type Phase41Record
} from "./repositories/phase4-repositories";
