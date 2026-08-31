import { z } from "zod";

/**
 * The identity a modification is attached to: structural position plus content
 * identity, resolved against the target page at render time. See CONTEXT.md — Locator.
 */
export const LocatorSchema = z.object({
  path: z.string().min(1),
  fingerprint: z.string().min(1),
  textHint: z.string(),
});
export type Locator = z.infer<typeof LocatorSchema>;

const BaseModification = z.object({
  id: z.string().min(1),
  target: LocatorSchema,
});

export const HideModificationSchema = BaseModification.extend({
  type: z.literal("hide"),
});

export const ContextModificationSchema = BaseModification.extend({
  type: z.literal("context"),
  value: z.object({
    text: z.string().min(1),
  }),
});

export const ForwardLinkModificationSchema = BaseModification.extend({
  type: z.literal("forwardLink"),
  value: z.object({
    href: z.string().url(),
    maxChars: z.number().int().positive().optional(),
  }),
});

export const ModificationSchema = z.discriminatedUnion("type", [
  HideModificationSchema,
  ContextModificationSchema,
  ForwardLinkModificationSchema,
]);
export type Modification = z.infer<typeof ModificationSchema>;
export type ModificationType = Modification["type"];

/**
 * One document per normalized URL: the complete set of modifications for a target
 * page. The unit of save, load, and storage. See CONTEXT.md — Configuration.
 */
export const ConfigurationSchema = z.object({
  version: z.literal(1),
  url: z.string().url(),
  updatedAt: z.string().datetime(),
  modifications: z.array(ModificationSchema),
});
export type Configuration = z.infer<typeof ConfigurationSchema>;

/**
 * Why a render attempt failed to produce an agent payload. Shared between
 * server and client so the failure taxonomy can only drift in one place.
 */
export const RenderFailureReasonSchema = z.enum([
  "blocked-for-security",
  "blocked-by-site",
  "timeout",
  "unsupported-content-type",
  "too-large",
  "too-many-redirects",
  "network",
  "budget-exceeded",
]);
export type RenderFailureReason = z.infer<typeof RenderFailureReasonSchema>;

export { buildLocator } from "./locator";
