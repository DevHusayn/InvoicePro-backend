# Recurring Invoice Automation

This script (`generateRecurringInvoices.js`) automatically generates new invoices for active recurring invoice templates. 

## How it works
- Finds all invoices marked as recurring (`isRecurring: true`) with a valid `recurringEndDate`.
- For each template, checks if a new invoice should be generated based on the frequency and last generated invoice.
- Creates a new invoice (not recurring) for the next occurrence if due.

## Usage

1. Ensure your `.env` file has the correct `MONGO_URI`.
2. Run the script manually:

    ```sh
    node generateRecurringInvoices.js
    ```

3. Or schedule it to run automatically (recommended):
   - **Windows Task Scheduler** or **cron** (Linux/Mac)
   - Or use a Node.js scheduler like `node-cron` for in-app automation

## Customization
- Adjust frequency logic as needed for your business rules.
- The script uses the original invoice as a template and appends the date to the invoice number for uniqueness.

---

For questions or improvements, see the main backend code or contact the maintainer.
