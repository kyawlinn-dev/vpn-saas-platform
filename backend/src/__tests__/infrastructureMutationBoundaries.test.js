import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(async () => { throw Object.assign(new Error("SERVER_MIGRATION_IN_PROGRESS"), { code: "SERVER_MIGRATION_IN_PROGRESS" }); }) }));
vi.mock("../services/infrastructure/customerMutationGuard.js", () => ({ withCustomerInfrastructureMutation: mocks.guard }));
import * as provision from "../services/subscriptionProvisionService.js";
import * as lifecycle from "../services/orderLifecycleService.js";
import * as trial from "../services/trialService.js";
import * as provider from "../services/vpnProviderService.js";

describe("customer sagas hold lifecycle coordination before touching access", () => {
  it.each([
    [provision, "provisionServersForToken", { order: { id: "order" }, servers: [{ id: "server" }] }],
    [provision, "switchOrderServer", { order: { id: "order" }, oldKey: { server_id: "old" }, newServer: { id: "new" } }],
    [provision, "switchOrderProtocol", { order: { id: "order" }, server: { id: "server" } }],
    [provision, "deleteProvisionedKeysForOrder", "order"],
    [provision, "updateProvisionedKeyLimitsForOrder", { orderId: "order" }],
    [lifecycle, "stopOrderAccess", "order"],
    [lifecycle, "provisionOrderAccess", { order: { id: "order" } }],
    [lifecycle, "extendOrder", { orderId: "order" }],
    [lifecycle, "renewOrder", { orderId: "order" }],
    [lifecycle, "confirmPayment", { orderId: "order" }],
    [lifecycle, "rejectPayment", { orderId: "order" }],
    [lifecycle, "activateOrder", { orderId: "order" }],
    [lifecycle, "stopOrder", { orderId: "order" }],
    [lifecycle, "activateScheduledOrder", { id: "order" }],
    [lifecycle, "activatePendingReviewPurchase", { order: { id: "order" } }],
    [trial, "provisionTrialKey", { orderId: "order" }],
    [provider, "createKey", { server: { id: "server" } }],
    [provider, "deleteKey", { server: { id: "server" } }],
    [provider, "updateKeyDataLimit", { server: { id: "server" } }],
    [provider, "updateKeyServices", { server: { id: "server" } }],
    [provider, "renameKey", { server: { id: "server" } }],
  ])("guards %s.%s", async (module, method, input) => {
    await expect(module[method](input)).rejects.toMatchObject({ code: "SERVER_MIGRATION_IN_PROGRESS" });
  });
});
