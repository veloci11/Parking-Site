import { commercialDetailsSchema } from "@/lib/commercial-details";
import { conditionObservationsInputSchema } from "@/lib/condition-observations";
import { z } from "zod";
const text = z.string().trim();
export const password = z
  .string()
  .min(12, "Utilisez au moins 12 caractères.")
  .max(128);
const spaceSchema = z.object({
  id: z.string().uuid(),
  number: text.max(40),
  level: z.number().int().min(-20).max(20),
  areaM2: z.number().positive().max(500).nullable(),
  lengthM: z.number().positive().max(50).nullable(),
  widthM: z.number().positive().max(50).nullable(),
  clearanceM: z.number().positive().max(20).nullable(),
});
export const qualitySchema = z.object({
  floor: text.max(500),
  lighting: text.max(500),
  humidity: text.max(500),
  access: text.max(500),
  maneuver: text.max(500),
  observations: text.max(4000),
  observedAt: z
    .string()
    .datetime({ offset: true })
    .refine(
      (value) => Date.parse(value) <= Date.now() + 300000,
      "La date ne peut pas être future.",
    )
    .nullable()
    .optional(),
  basis: z
    .enum(["seller_observation", "provided_document", "unknown"])
    .optional(),
});
export const draftSchema = z
  .object({
    title: text.max(90).optional(),
    description: text.max(5000).optional(),
    city: text.max(80).optional(),
    district: text.max(100).optional(),
    priceCents: z.number().int().min(0).max(10000000000).optional(),
    transactionType: z.enum(["sale", "rent"]).optional(),
    type: z.enum(["covered", "box", "outdoor", "mixed"]).optional(),
    spaces: z.array(spaceSchema).min(1).max(500).optional(),
    photos: z.array(z.string().max(200)).max(20).optional(),
    spacePhotos: z
      .record(z.string().max(100), z.array(z.string().max(200)).max(6))
      .optional(),
    quality: qualitySchema.optional(),
    commercialDetails: commercialDetailsSchema.optional(),
    publicCoordinates: z
      .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
      .optional(),
    locationConfirmedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    conditionObservations: conditionObservationsInputSchema.optional(),
    unitQuality: z.record(z.string().max(100), qualitySchema).optional(),
    locationPrecision: z.enum(["area", "exact_opt_in"]).optional(),
    coordinates: z
      .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
      .optional(),
    address: text.max(200).optional(),
    occupancy: z.enum(["vacant", "occupied", "unknown"]).optional(),
    annualChargesCents: z
      .number()
      .int()
      .min(0)
      .max(100000000)
      .nullable()
      .optional(),
    propertyTaxCents: z
      .number()
      .int()
      .min(0)
      .max(100000000)
      .nullable()
      .optional(),
    observedAt: z.string().datetime({ offset: true }).nullable().optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
