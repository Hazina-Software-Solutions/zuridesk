import { e164PhoneNumberSchema, normalizedEmailSchema } from "@zuridesk/shared";

import { UserModel } from "../models/identity-models";
import type { UserDto, UserStatus } from "./identity-types";
import { requiredName, toObjectId } from "./repository-helpers";
import { userDto } from "./serializers";

export interface CreateUserInput {
  id?: string;
  displayName: string;
  normalizedEmail?: string;
  phone?: string;
}

export interface UpdateUserProfileInput {
  displayName?: string;
  normalizedEmail?: string | null;
  phone?: string | null;
  status?: UserStatus;
}

export const userRepository = {
  async create(input: CreateUserInput): Promise<UserDto> {
    const document = await UserModel.create({
      schemaVersion: 1,
      ...(input.id === undefined ? {} : { _id: toObjectId(input.id) }),
      displayName: requiredName(input.displayName, "displayName"),
      ...(input.normalizedEmail === undefined
        ? {}
        : { normalizedEmail: normalizedEmailSchema.parse(input.normalizedEmail) }),
      ...(input.phone === undefined ? {} : { phone: e164PhoneNumberSchema.parse(input.phone) }),
      status: "active",
      deletedAt: null
    });
    return userDto(document);
  },

  async findById(id: string): Promise<UserDto | null> {
    const document = await UserModel.findOne({
      _id: toObjectId(id),
      deletedAt: null
    });
    return document === null ? null : userDto(document);
  },

  async updateProfile(id: string, patch: UpdateUserProfileInput): Promise<UserDto | null> {
    const document = await UserModel.findOne({ _id: toObjectId(id), deletedAt: null });
    if (document === null) return null;

    if (patch.displayName !== undefined) {
      document.displayName = requiredName(patch.displayName, "displayName");
    }
    if (patch.normalizedEmail !== undefined) {
      if (patch.normalizedEmail === null) document.set("normalizedEmail", undefined);
      else document.normalizedEmail = normalizedEmailSchema.parse(patch.normalizedEmail);
    }
    if (patch.phone !== undefined) {
      if (patch.phone === null) document.set("phone", undefined);
      else document.phone = e164PhoneNumberSchema.parse(patch.phone);
    }
    if (patch.status !== undefined) document.status = patch.status;

    await document.save();
    return userDto(document);
  }
};
