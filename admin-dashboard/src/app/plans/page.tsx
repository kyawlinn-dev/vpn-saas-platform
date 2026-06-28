async function getPlans() {
  const res = await fetch("http://localhost:3000/api/plans", {
    cache: "no-store",
  });

  return res.json();
}

export default async function PlansPage() {
  const plans = await getPlans();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Plans</h1>

      <div className="grid gap-4">
        {plans.map((plan: any) => (
          <div key={plan.id} className="border p-4 rounded">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p>Price: {plan.price_mmk} MMK</p>
            <p>Data: {plan.data_limit_gb} GB</p>
            <p>Devices: {plan.max_devices}</p>
          </div>
        ))}
      </div>
    </div>
  );
}