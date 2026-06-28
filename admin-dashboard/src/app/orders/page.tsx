"use client";

import { useEffect, useState } from "react";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loadingId, setLoadingId] = useState(null);

  async function fetchOrders() {
    const res = await fetch("http://localhost:3000/api/orders");
    const data = await res.json();
    setOrders(data);
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  async function handleActivate(orderId) {
    try {
      setLoadingId(orderId);

      const res = await fetch(
        `http://localhost:3000/api/order-actions/${orderId}/activate`,
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to activate order");
        return;
      }

      await fetchOrders();
    } catch (err) {
      alert("Something went wrong while activating order");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <a
          href="/orders/create"
          className="border rounded px-4 py-2 hover:bg-neutral-100 hover:text-black"
        >
          Create Order
        </a>
      </div>

      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="border rounded p-4">
            <h2 className="text-lg font-semibold">
              {order.customer?.full_name || "Unknown Customer"}
            </h2>
            <p>Plan: {order.plan?.name || "-"}</p>
            <p>Status: {order.status}</p>
            <p>Price: {order.price_mmk} MMK</p>
            <p>Commission: {order.commission_amount_mmk} MMK</p>
            <p>Start: {order.start_date || "-"}</p>
            <p>Expiry: {order.expiry_date || "-"}</p>

            <button
              className="border px-3 py-1 mt-3 rounded hover:bg-neutral-100 hover:text-black disabled:opacity-50"
              onClick={() => handleActivate(order.id)}
              disabled={loadingId === order.id}
            >
              {loadingId === order.id ? "Activating..." : "Activate"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}