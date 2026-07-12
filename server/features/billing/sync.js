export async function getCheckoutPaymentStatus(checkoutId, runtimeConfig = useRuntimeConfig()) {
  const stripeSecretKey = runtimeConfig.stripeSecretKey;
  if (!stripeSecretKey) {
    const error = new Error('Stripe secret key is not configured');
    error.statusCode = 503;
    throw error;
  }

  const response = await $fetch(`https://api.stripe.com/v1/checkout/sessions/${checkoutId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return response.payment_status;
}
