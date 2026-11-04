import {
  cancelBooking,
  completeBooking,
  completeBookingLine,
  confirmBooking,
  createBooking,
  DatabaseCommandError,
  getBooking,
  getBookingCatalogue,
  listBookingLocations,
  listBookings,
  markBookingNoShow,
  queryBookingAvailability,
  rescheduleBooking,
  serviceCatalogueRepository,
  skipBookingLine,
  startBooking,
  startBookingLine,
  type TrustedTenantContext
} from "@zuridesk/db";
import {
  serviceDtoSchema,
  type AvailabilityQuery,
  type AvailabilityResult,
  type BookingCatalogueResult,
  type BookingCommandResult,
  type BookingDto,
  type BookingLineMutationCommand,
  type BookingListQuery,
  type BookingListResult,
  type BookingLocationListResult,
  type CancelBookingCommand,
  type CompleteBookingCommand,
  type ConfirmBookingCommand,
  type CreateBookingCommand,
  type MarkBookingNoShowCommand,
  type RescheduleBookingCommand,
  type ServiceDto,
  type SkipBookingLineCommand,
  type StartBookingCommand
} from "@zuridesk/shared";

export interface BookingApplicationService {
  listLocations(context: TrustedTenantContext): Promise<BookingLocationListResult>;
  listServices(context: TrustedTenantContext): Promise<readonly ServiceDto[]>;
  createService(
    context: TrustedTenantContext,
    input: { name: string; description?: string | null | undefined }
  ): Promise<ServiceDto>;
  updateService(
    context: TrustedTenantContext,
    serviceId: string,
    input: { name?: string | undefined; description?: string | null | undefined }
  ): Promise<ServiceDto>;
  archiveService(context: TrustedTenantContext, serviceId: string): Promise<void>;
  getCatalogue(context: TrustedTenantContext, locationId: string): Promise<BookingCatalogueResult>;
  availability(
    context: TrustedTenantContext,
    input: AvailabilityQuery
  ): Promise<AvailabilityResult>;
  listBookings(context: TrustedTenantContext, input: BookingListQuery): Promise<BookingListResult>;
  getBooking(context: TrustedTenantContext, bookingId: string): Promise<BookingDto>;
  createBooking(
    context: TrustedTenantContext,
    input: CreateBookingCommand
  ): Promise<BookingCommandResult>;
  confirmBooking(
    context: TrustedTenantContext,
    input: ConfirmBookingCommand
  ): Promise<BookingCommandResult>;
  rescheduleBooking(
    context: TrustedTenantContext,
    input: RescheduleBookingCommand
  ): Promise<BookingCommandResult>;
  startBooking(
    context: TrustedTenantContext,
    input: StartBookingCommand
  ): Promise<BookingCommandResult>;
  startBookingLine(
    context: TrustedTenantContext,
    input: BookingLineMutationCommand
  ): Promise<BookingCommandResult>;
  completeBookingLine(
    context: TrustedTenantContext,
    input: BookingLineMutationCommand
  ): Promise<BookingCommandResult>;
  skipBookingLine(
    context: TrustedTenantContext,
    input: SkipBookingLineCommand
  ): Promise<BookingCommandResult>;
  completeBooking(
    context: TrustedTenantContext,
    input: CompleteBookingCommand
  ): Promise<BookingCommandResult>;
  markBookingNoShow(
    context: TrustedTenantContext,
    input: MarkBookingNoShowCommand
  ): Promise<BookingCommandResult>;
  cancelBooking(
    context: TrustedTenantContext,
    input: CancelBookingCommand
  ): Promise<BookingCommandResult>;
}

export class BookingService implements BookingApplicationService {
  listLocations(context: TrustedTenantContext): Promise<BookingLocationListResult> {
    return execute(() => listBookingLocations(context));
  }

  async listServices(context: TrustedTenantContext): Promise<readonly ServiceDto[]> {
    return execute(async () => {
      const records = await serviceCatalogueRepository.listActive(context, 500);
      return records.map(serviceDto);
    });
  }

  async createService(
    context: TrustedTenantContext,
    input: { name: string; description?: string | null | undefined }
  ): Promise<ServiceDto> {
    return execute(() =>
      serviceCatalogueRepository
        .create(context, {
          name: input.name,
          ...(input.description === undefined ? {} : { description: input.description })
        })
        .then(serviceDto)
    );
  }

  async updateService(
    context: TrustedTenantContext,
    serviceId: string,
    input: { name?: string | undefined; description?: string | null | undefined }
  ): Promise<ServiceDto> {
    return execute(async () => {
      const record = await serviceCatalogueRepository.update(context, serviceId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description })
      });
      if (record === null) throw new BookingServiceError("NOT_FOUND", 404);
      return serviceDto(record);
    });
  }

  async archiveService(context: TrustedTenantContext, serviceId: string): Promise<void> {
    return execute(async () => {
      const record = await serviceCatalogueRepository.archive(context, serviceId);
      if (record === null) throw new BookingServiceError("NOT_FOUND", 404);
    });
  }

  getCatalogue(context: TrustedTenantContext, locationId: string): Promise<BookingCatalogueResult> {
    return execute(() => getBookingCatalogue(context, locationId));
  }

  availability(
    context: TrustedTenantContext,
    input: AvailabilityQuery
  ): Promise<AvailabilityResult> {
    return execute(() => queryBookingAvailability(context, input));
  }

  listBookings(context: TrustedTenantContext, input: BookingListQuery): Promise<BookingListResult> {
    return execute(() => listBookings(context, input));
  }

  getBooking(context: TrustedTenantContext, bookingId: string): Promise<BookingDto> {
    return execute(() => getBooking(context, bookingId));
  }

  createBooking(
    context: TrustedTenantContext,
    input: CreateBookingCommand
  ): Promise<BookingCommandResult> {
    return execute(() => createBooking(context, input));
  }

  confirmBooking(
    context: TrustedTenantContext,
    input: ConfirmBookingCommand
  ): Promise<BookingCommandResult> {
    return execute(() => confirmBooking(context, input));
  }

  rescheduleBooking(
    context: TrustedTenantContext,
    input: RescheduleBookingCommand
  ): Promise<BookingCommandResult> {
    return execute(() => rescheduleBooking(context, input));
  }

  startBooking(
    context: TrustedTenantContext,
    input: StartBookingCommand
  ): Promise<BookingCommandResult> {
    return execute(() => startBooking(context, input));
  }

  startBookingLine(
    context: TrustedTenantContext,
    input: BookingLineMutationCommand
  ): Promise<BookingCommandResult> {
    return execute(() => startBookingLine(context, input));
  }

  completeBookingLine(
    context: TrustedTenantContext,
    input: BookingLineMutationCommand
  ): Promise<BookingCommandResult> {
    return execute(() => completeBookingLine(context, input));
  }

  skipBookingLine(
    context: TrustedTenantContext,
    input: SkipBookingLineCommand
  ): Promise<BookingCommandResult> {
    return execute(() => skipBookingLine(context, input));
  }

  completeBooking(
    context: TrustedTenantContext,
    input: CompleteBookingCommand
  ): Promise<BookingCommandResult> {
    return execute(() => completeBooking(context, input));
  }

  markBookingNoShow(
    context: TrustedTenantContext,
    input: MarkBookingNoShowCommand
  ): Promise<BookingCommandResult> {
    return execute(() => markBookingNoShow(context, input));
  }

  cancelBooking(
    context: TrustedTenantContext,
    input: CancelBookingCommand
  ): Promise<BookingCommandResult> {
    return execute(() => cancelBooking(context, input));
  }
}

export class BookingServiceError extends Error {
  constructor(
    readonly code: "CONFLICT" | "CONFIGURATION_CHANGED" | "FORBIDDEN" | "NOT_FOUND",
    readonly statusCode: 403 | 404 | 409
  ) {
    super(code);
    this.name = "BookingServiceError";
  }
}

async function execute<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BookingServiceError) throw error;
    if (error instanceof DatabaseCommandError) {
      if (error.code === "FORBIDDEN") throw new BookingServiceError("FORBIDDEN", 403);
      if (error.code === "NOT_FOUND") throw new BookingServiceError("NOT_FOUND", 404);
      if (error.code === "CONFIGURATION_CHANGED") {
        throw new BookingServiceError("CONFIGURATION_CHANGED", 409);
      }
      if (error.code === "CONFLICT") throw new BookingServiceError("CONFLICT", 409);
    }
    throw error;
  }
}

function serviceDto(record: Readonly<Record<string, unknown>>): ServiceDto {
  return serviceDtoSchema.parse({
    id: record.id,
    name: record.name,
    description: record.description ?? null
  });
}
