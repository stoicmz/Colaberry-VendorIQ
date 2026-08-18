# Quality Contract: orders.csv

Applies to: `skill-lab/orders.csv`

| Field | Rule |
|---|---|
| `order_id` | Must be unique — no duplicate order IDs |
| `region` | Required — no blank/missing values |
| `revenue` | Must be greater than 0 |
| `load_timestamp` | Must be less than 24 hours old at time of validation |
| Row count | Expected at least 10 rows |
