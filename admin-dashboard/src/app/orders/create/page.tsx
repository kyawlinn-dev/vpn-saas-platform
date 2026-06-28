"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateOrderPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      const [customersRes, plansRes] = await Promise.all([
        fetch("http://localhost:3000/api/customers"),
        fetch("http://localhost:3000/api/plans"),
      ]);

      const [customersData, plansData] = await Promise.all([
        customersRes.json(),
        plansRes.json(),
      ]);

      setCustomers(customersData);
      setPlans(plansData);
    }

    loadData();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: customerId,
          plan_id: planId,
          payment_note: paymentNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create order");
      }

      router.push("/orders");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Create Order</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <select
          className="w-full border rounded px-3 py-2 bg-transparent"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          required
        >
          <option value="">Select customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.full_name}
            </option>
          ))}
        </select>

        <select
          className="w-full border rounded px-3 py-2 bg-transparent"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          required
        >
          <option value="">Select plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} - {plan.price_mmk} MMK
            </option>
          ))}
        </select>

        <textarea
          className="w-full border rounded px-3 py-2 bg-transparent"
          placeholder="Payment note"
          value={paymentNote}
          onChange={(e) => setPaymentNote(e.target.value)}
        />

        {error && <p className="text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="border rounded px-4 py-2 hover:bg-neutral-100 hover:text-black disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Order"}
        </button>
      </form>
    </div>
  );
}