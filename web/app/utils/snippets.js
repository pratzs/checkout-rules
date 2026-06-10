// Plain constants — no server-only code, safe for both client and server bundles.

export const SHIPPING_BAR_SNIPPET_KEY = "snippets/dutch-rusk-shipping-bar.liquid";

export const SHIPPING_BAR_SNIPPET = `{% comment %}
  Dutch Rusk free-shipping threshold bar.
  Include in your cart section: {% render 'dutch-rusk-shipping-bar' %}
  Place it just above the cart totals / checkout button.
{% endcomment %}

{% assign free_shipping_cents = 15000 %}
{% assign remaining_cents = free_shipping_cents | minus: cart.total_price %}

<div
  id="dr-shipping-bar"
  class="dr-shipping-bar"
  data-threshold="{{ free_shipping_cents }}"
  data-cart-total="{{ cart.total_price }}"
  {% if cart.total_price >= free_shipping_cents %}style="display:none"{% endif %}
>
  <div class="dr-shipping-bar__icon">&#9432;</div>
  <div class="dr-shipping-bar__content">
    <p class="dr-shipping-bar__headline">
      {% if cart.total_price < free_shipping_cents %}
        Add
        <strong>
          {% assign remaining_dollars = remaining_cents | divided_by: 100.0 %}
          ` + "$" + `{{ remaining_dollars | round: 2 }}
        </strong>
        more to your order for <strong>free shipping</strong>.
      {% endif %}
    </p>
    <p class="dr-shipping-bar__note">
      Orders under $150 will have shipping charges applied.
      The cost is calculated based on the weight of your order and delivery location,
      and will be included on your invoice.
    </p>
  </div>
</div>

<style>
  .dr-shipping-bar {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background-color: #181344;
    color: #FEFEFE;
    border-left: 4px solid #F58220;
    border-radius: 4px;
    padding: 14px 16px;
    margin-bottom: 16px;
    font-size: 14px;
    line-height: 1.5;
  }
  .dr-shipping-bar__icon { font-size: 20px; line-height: 1; flex-shrink: 0; margin-top: 1px; color: #F58220; }
  .dr-shipping-bar__content { flex: 1; }
  .dr-shipping-bar__headline { margin: 0 0 6px; font-size: 15px; }
  .dr-shipping-bar__headline strong { color: #F58220; }
  .dr-shipping-bar__note { margin: 0; opacity: 0.85; font-size: 13px; }
</style>

<script>
  (function () {
    var bar = document.getElementById('dr-shipping-bar');
    if (!bar) return;
    var THRESHOLD = parseInt(bar.dataset.threshold, 10);
    function updateBar(totalCents) {
      if (totalCents >= THRESHOLD) { bar.style.display = 'none'; return; }
      var remaining = ((THRESHOLD - totalCents) / 100).toFixed(2);
      var headline = bar.querySelector('.dr-shipping-bar__headline');
      if (headline) {
        headline.innerHTML = 'Add <strong>$' + remaining + '</strong> more to your order for <strong>free shipping</strong>.';
      }
      bar.style.display = 'flex';
    }
    document.addEventListener('cart:updated', function (e) {
      var total = e.detail && e.detail.cart && e.detail.cart.total_price;
      if (typeof total === 'number') updateBar(total);
    });
    document.addEventListener('shopify:section:load', function () {
      fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) { updateBar(cart.total_price); });
    });
  })();
</script>`;
