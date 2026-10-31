import { describe, expect, it } from "vitest";
import { describeAudit } from "@/features/orders/audit";

describe("describeAudit", () => {
  it("uses the owner's status names", () => {
    expect(describeAudit("order.status", { from: "pending", to: "contacted" })).toBe("Status New → Contacted");
    expect(describeAudit("order.status", { from: "confirmed", to: "cancelled", note: "Refused" })).toBe("Status Confirmed → Cancelled. Note: Refused");
  });

  it("shows money as rupees, from paisa", () => {
    expect(describeAudit("order.delivery_charge", { from_paisa: 0, to_paisa: 85000, total_paisa: 1735000 })).toBe(
      "Delivery charge Rs 0 → Rs 850 (order total Rs 17,350)",
    );
  });

  it("describes a shipment, a note and a payment without inventing anything", () => {
    expect(describeAudit("order.shipment", { courier: "TCS", tracking_number: "TCS-1" })).toBe("Courier TCS, tracking TCS-1");
    expect(describeAudit("order.note", { note_id: "x", length: 12 })).toBe("Internal note added");
    expect(describeAudit("order.payment_status", { to: "paid" })).toBe("Payment marked paid");
    expect(describeAudit("order.something_new", {})).toBe("order.something_new");
  });
});
