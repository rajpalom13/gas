# V5 Settlement System - Test Checklist

## 1. Authentication
- [x] Login with valid credentials
- [x] Verify redirect to dashboard after login

## 2. Dashboard Page
- [x] Page loads with today's stats
- [x] Stat cards show: Total Deliveries, Total Revenue, Total Add Ons, Total Deductions
- [x] Second row: Amount Pending, Active Staff, Cash Collected, Total Staff Debt
- [x] Inventory Overview section displays cylinder sizes with Full/Empty/Price
- [ ] Empty Cylinder Reconciliation section appears (if data exists)
- [ ] Date navigation (prev/next day) works
- [ ] Low stock alerts display when applicable

## 3. Inventory Page
- [ ] Page loads with cylinder types listed
- [ ] Can add a new cylinder type
- [ ] Can edit existing cylinder stock/price
- [ ] Can delete a cylinder type

## 4. Staff Page
- [ ] Page loads with staff list
- [ ] Can add new staff member
- [ ] Can view staff details
- [ ] Staff debt balances display

## 5. Customers Page
- [ ] Page loads with customer list
- [ ] Can add new customer
- [ ] Customer debts (cash + cylinder) display correctly

## 6. Settlement Creation (NEW - V5 Core Feature)
- [ ] Navigate to /settlements/new
- [ ] Date defaults to today (IST)
- [ ] First staff section loads with staff selector
- [ ] Can select a staff member from dropdown
- [ ] Can add cylinder items (size, quantity, price override)
- [ ] Gross Revenue auto-calculates from cylinder items
- [ ] Can add Add Ons with typable category combobox
- [ ] New addon category auto-saves and appears in dropdown on next use
- [ ] Can add Deductions with typable category combobox
- [ ] Can toggle debtor on deduction and assign to customer
- [ ] Formula displays: Gross + AddOns - Deductions = Expected
- [ ] Cash denomination entry works (500, 200, 100, 50, 20, 10 notes)
- [ ] Amount Received auto-calculates from denominations
- [ ] Difference shows correctly (Expected - Received)
- [ ] "Add to Staff Debt" checkbox appears when difference > 0
- [ ] Can enter empty cylinders returned per size
- [ ] Can assign empty shortage to debtor/customer
- [ ] Notes field works
- [ ] "Add Another Delivery Man" button adds second staff section
- [ ] Consolidated summary table shows at bottom
- [ ] Auto-save draft works (leave page, come back, draft prompt appears)
- [ ] Submit creates settlement successfully
- [ ] Inventory updates after submission (full stock decreases, empty stock increases)

## 7. Settlement List Page
- [ ] Page loads with list of settlements
- [ ] Shows: Date, Staff names, Cylinders, Expected, Received, Difference
- [ ] V5 settlements show multiple staff names
- [ ] Old V3 settlements still display correctly (if any exist)
- [ ] Pagination works
- [ ] Can click to view settlement details

## 8. Settlement Detail/Edit Page
- [ ] View mode shows per-staff collapsible sections
- [ ] Each section shows: items, addons, deductions, denominations, empties
- [ ] Consolidated summary at bottom
- [ ] Can switch to edit mode
- [ ] Edit mode loads StaffSettlementSection components with existing data
- [ ] Can modify and save changes
- [ ] Can delete a settlement (with confirmation)
- [ ] Deletion reverses inventory/debt side effects

## 9. Reports Page
- [ ] Page loads with summary stats (Revenue, Add Ons, Deductions, etc.)
- [ ] Date range picker and presets work (Today, 7 Days, 30 Days, This Month)
- [ ] Staff Performance table shows staff with Add Ons/Deductions columns
- [ ] Add On / Deduction Breakdown table displays
- [ ] Category Report section: can select category, search, see results
- [ ] Empty Cylinder Reconciliation summary displays
- [ ] Cylinder Distribution cards display
- [ ] Daily Trends table works
- [ ] CSV Export downloads correctly

## 10. Empty Cylinders Page
- [ ] Page loads with current empty stock
- [ ] Daily Reconciliation table shows (no DBC column)
- [ ] Per-Settlement Breakdown accordion works
- [ ] 7-Day Trend table displays
- [ ] Date navigation works

## 11. Edge Cases
- [ ] Creating settlement with 0 cylinder items shows appropriate error
- [ ] Insufficient stock shows error message
- [ ] Settlement with multiple delivery men processes correctly
- [ ] Deduction with debtor correctly updates customer debt

## 12. Cross-Page Verification
- [ ] After creating settlement: dashboard stats update
- [ ] After creating settlement: inventory stock changes reflected
- [ ] After creating settlement: reports include new data
- [ ] After deleting settlement: inventory reverts
