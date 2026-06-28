async function getCustomers() {
  const res = await fetch("http://localhost:3000/api/customers", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch customers");
  }

  return res.json();
}

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Customers</h1>
        <a
          href="/customers/create"
          className="border rounded px-4 py-2 hover:bg-neutral-100 hover:text-black"
        >
          Create Customer
        </a>
      </div>

      <div className="space-y-4">
        {customers.map((customer: any) => (
          <div key={customer.id} className="border rounded p-4">
            <h2 className="text-lg font-semibold">{customer.full_name}</h2>
            <p>Telegram: {customer.telegram_username || "-"}</p>
            <p>Phone: {customer.phone || "-"}</p>
            <p>Status: {customer.status}</p>
            <p>Reseller: {customer.reseller?.name || "Direct"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}