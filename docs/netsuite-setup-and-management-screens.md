# NetSuite setup and management screens

## 1. Overview

### 1.1 Objective

One NetSuite area in the Company app, where a Customer Success Manager sets up a client's NetSuite
integration one store at a time, and checks every day that it works.

### 1.2 Problem

Today a Customer Success Manager has no single place that says what is set up, what is missing,
and what is broken.

- The NetSuite page is a list of setting buttons. Nothing says what to do first, or what is done.
- The NetSuite login is entered in an old Moqui admin screen, outside the Company app.
- NetSuite location ids are set one facility at a time, on each facility's page.
- Jobs are switched on in a generic job screen, in an order that lives in a document.
- A client with several stores, such as US, Canada and EU, cannot see one store's setup apart from
  the others.
- After go-live there is one count card, which shows "Unavailable", and the order push rules. Records
  that failed to sync cannot be seen.

### 1.3 Success criteria

- A Customer Success Manager sets up a new client without leaving the Company app.
- Any colleague sees the same setup state, because it is read from the server.
- A record that failed to sync is found, fixed and sent again from the app.

## 2. Scope

### 2.1 In scope

The five screens below, and the server additions they need.

### 2.2 Out of scope

- Deploying NetSuite scripts. The NetSuite Admin does that in NetSuite.
- The Shopify side of each flow. It stays in the Shopify area.

## 3. Background

The requirements are three setup stories in mantle-netsuite-connector:

- [Setting up NetSuite for a new client](https://github.com/hotwax/mantle-netsuite-connector/blob/main/docs/new-client-setup/setting-up-netsuite.md)
- [Setting up products for a new client](https://github.com/hotwax/mantle-netsuite-connector/blob/main/docs/product-data/setting-up-products.md)
- [Setting up inventory for a new client](https://github.com/hotwax/mantle-netsuite-connector/blob/main/docs/inventory/setting-up-inventory.md)

The setup story switches on the jobs one store at a time (step 10). So the user first chooses a
store, then works on that store's flows. The NetSuite connection is shared by all stores. Each
flow of a store has its own go-live date. HotWax moves it when a new version of that flow's sync is
released.

The screens follow the app's Shopify area, so users meet patterns they already know:

- The Shopify connection page has a "Configuration" section, then one section per area, with a
  status card for each main flow and link cards below it.
- Each Shopify flow page opens with a setup step list (Inventory sync: "0 of 4 setup steps
  complete"), then shows monitoring, key dates, history and job runs.
- Order sync creates its job paused, and an administrator activates it.

They also take three habits from Celigo, the tool many NetSuite clients use for Shopify and NetSuite:

- Each flow shows at a glance whether it is on, when it last ran, and how many records failed to sync.
- Values are mapped by picking NetSuite's own records by name, not by typing internal ids.
- Each record that failed to sync can be sent again, or resolved with a note.

What the current NetSuite page settings feed today:

| Page | Read today by | Place in the new screens |
|---|---|---|
| Orders pending sync | The current order push queue | Orders flow card |
| Order sync monitoring | The current order push rules | Orders flow page |
| Shipping methods, Payment method, Departments | Current order, deposit and return code | Mapping pages under their flows |
| SFTP | NetSuite scripts that write files | Configuration |
| Inventory variances | The store adjustment job (the reasons only) | Stock flow |
| Product Store and subsidiary | Only the old order file feed | Rework as the chosen store's subsidiary |
| Price level | Only the old order file feed | Check whether the current push needs it |
| Discounts | Only one client's old return sync | Rework to save the default discount item the current push reads |
| Sales Channel | No reader found in the connector or client code | Check before keeping |

## 4. The screens

Each screen says who opens it, what they want to know in that order, and where the page answers it.

### 4.1 NetSuite home

Replaces today's NetSuite page. Same layout as the Shopify connection page, with a store choice
above the flows.

Opened by the Customer Success Manager, during setup and every day.

| Question, in order | Where the page answers it |
|---|---|
| Is the OMS connected to NetSuite? | Top card, shared by all stores: "Connected to sandbox 1234567-sb1, tested 22 Nov", or "Not connected", with a Connect button |
| Which store am I working on? | A store choice under the top card, such as US, Canada or EU. A client with one store sees no choice |
| Which flows of this store are on, and is any in trouble? | One status card per flow of the chosen store, in sections: "Products and Inventory" (Products, Stock, Transfers), "Orders and fulfillment" (Orders, Shipments from NetSuite), "Returns". Each card shows On, Paused or Setup required, the last run, what is pending sync, and what failed to sync today |
| What still needs setting up for this store? | A "Setup required" badge on the flow card, with the count of missing steps, such as "2 of 6 missing" |
| Where do I change a setting? | The "Configuration" section, shared by all stores: Connection, File server (SFTP), NetSuite catalog. The chosen store's subsidiary sits above its flows |

### 4.2 Connection

A page under Configuration, like Shopify's "API credentials".

Opened by the Customer Success Manager, with the client's NetSuite Admin.

| Question, in order | Where the page answers it |
|---|---|
| Which NetSuite account is this, sandbox or production? | The account id field, with a Sandbox or Production label read from the id |
| Is the login right? | Four fields (account id, consumer key, certificate id, private key) and a "Test connection" button. The result shows next to the button |
| Can the OMS see what it needs? | After a good test, the page lists any HotWax script or field that the client's NetSuite does not have, by name, such as `custbody_hc_order_id` |

### 4.3 Flow page: Orders

The Orders flow page, for the chosen store. It is the first flow page. The other flows use the same
layout when their turn comes.

The flow and its steps are in
[NetSuite flows: Orders](https://github.com/hotwax/mantle-netsuite-connector/blob/docs/netsuite-flows/docs/netsuite-flows/netsuite-flows.md#orders).
Each step is one job. It sends the records that are ready, in one batch.

Opened by the Customer Success Manager: during setup, and every day after go-live.

Example: the store is US. Its Orders flow goes live on 1 December 2026. The client sends customers,
but does not move orders between locations.

| Question, in order | Where the page answers it |
|---|---|
| What does this store send? | The step list. Each step shows its name, what it sends, and whether it is required or the client's choice. The user turns each optional step on or off for this store |
| From which date? | A "Key dates" card, with one sentence: "Orders placed after 1 Dec 2026". The user changes the date here |
| Why did the date move? | The "Key dates" card keeps each earlier date, with who moved it, when and why, such as "new order sync released" |
| What else does this store pick? | Under the date, any other condition of the store's rules, read-only. Example: "Only orders from the web sales channel" |
| Is setup complete? | The setup list. Each item is marked done or missing, with a link to the page that fixes it |
| Is it on? | A "Switch on" button. It shows the missing setup items as warnings, but does not block |
| Is it working? | After switch-on, four counts for each step, each linking to its list (4.5) |

#### The step list

| Step | What it sends | Required? | Store's rules |
|---|---|---|---|
| Customer | The buyer, before the first order | Client's choice | Order rules |
| Sales order | The order | Required | Order rules |
| Payment | The payment, as a customer deposit | Required | Payment rules |
| Exchange payment | The payment of an exchange order | With exchanges | Payment rules |
| Refund | Money back for a cancelled order | Client's choice | Payment rules |
| Store shipment | A store hands over or ships the order | Client's choice | Order rules |
| Cancelled line | Closes a cancelled item's line | Client's choice | None: shared by all stores |
| Order change | A change to an order NetSuite has | Client's choice | None: shared by all stores |
| Order moved | The order moves to another location | Client's choice | None: shared by all stores |

The last three steps have no store rules. One job serves every store. So the page marks them
"Shared by all stores". Switching one on or off for this store changes it for every store, and the
page says so before it acts.

Without the Customer step, each order goes to one NetSuite customer per selling facility. The page
says this next to the step.

#### The go-live date

The flow has one go-live date for the store. The store's rules are kept in two rule groups: order
rules and payment rules. A rule group is the store's list of conditions for a step. The date is one
condition in each group.

So when the user changes the date, the page writes it into both groups, as one change with one
reason. The history keeps both groups' earlier dates as one entry.

A condition the page cannot write as a sentence is shown read-only, as stored. Only HotWax changes it.

#### The setup list

The items from the flow's "Before switching on" list:

1. The NetSuite login is saved and tested. All stores share it. Link: Connection (4.2).
2. Products have NetSuite item ids. Shows how many do not. Link: the Products flow.
3. Stores and warehouses have NetSuite location ids. Shows which do not.
4. Shipping methods, payment methods, tax codes and special items are mapped. Shows how many OMS
   values have no match. Link: Mapping page (4.4).
5. Each chosen step has its template, the root node that builds the record for NetSuite.
6. The go-live date is set. Done on this page.
7. The store's jobs exist, paused. The page creates them when the steps are chosen.

A missing item is a warning. The Customer Success Manager may still switch the flow on, because
some data in NetSuite or the OMS may not apply to this flow.

#### Switching on

The "Switch on" button starts the jobs of the chosen steps in this order:

1. The send and poll jobs, which carry each batch to NetSuite and read its answer. They are shared
   by all stores, so this happens only once.
2. Customer, when chosen.
3. Sales order.
4. Payment, then Refund and Exchange payment.
5. Store shipment, Cancelled line, Order change and Order moved, when chosen.

The order is a safe default, not a rule. A step finds nothing until the step before it has a
NetSuite id. Example: a payment waits until its order is in NetSuite.

The page records who switched the flow on, when, and which setup items were missing.

A "Pause" button stops the store's jobs. Shared jobs keep running while another store uses them.

#### Is it working

Four counts for each step, for this store:

| Count | What it means | Example |
|---|---|---|
| Failed to sync | NetSuite would not take the record. Each one keeps its error | Order 1001: "Invalid item 2411-101-G" |
| Stuck | A batch took the record and has no answer after one day | Payment of order 1002, sent 3 Dec |
| Pending sync more than one day | The record is due but still waits | Order 1003 waits for a NetSuite item id |
| Not picked | The record is due and placed after the go-live date, but the store's other rules leave it out. It never goes | Order 1004, from a sales channel the rules leave out |

Each count links to its list (4.5).

### 4.4 Mapping page

One layout for shipping methods, payment methods, discounts, tax codes and special items such as
the gift card.

Opened by the Customer Success Manager, or the client's NetSuite Admin.

Mappings are shared by all stores. One OMS value has one NetSuite match, and every store uses it.
For example, the shipping method "Ground" maps to "UPS Ground (2830)" for every store. So this page
has no store choice. When a store's flow checks its setup, it counts the OMS values that still have
no match.

| Question, in order | Where the page answers it |
|---|---|
| Which OMS values still have no NetSuite match? | A list of OMS values, unmatched first, with a count at the top: "3 of 10 not mapped" |
| What is the NetSuite match? | A dropdown of NetSuite's own records by name and id, read live from NetSuite, such as "Standard (2830)" |
| Is a saved match still valid? | A warning on a row whose NetSuite record is gone or inactive |

### 4.5 Failed to sync

One per flow, for the chosen store.

Opened by the Customer Success Manager, every day.

| Question, in order | Where the page answers it |
|---|---|
| Which records failed to sync? | A list: the record, such as an order id, when it was sent, and the error |
| What do I do about each one? | "Send again" after the data is fixed, or "Resolve" with a note when no resend is needed |
| Is anything pending sync for too long? | Filters for the other three counts on the flow page: "Stuck", "Pending sync more than one day" and "Not picked" |

## 5. What the server must add

1. A REST endpoint that saves the NetSuite login and tests the connection. Today this exists only
   in the Moqui admin screen.
2. One status call per flow and store: on or off, last run, missing setup, and the four counts per step: failed to sync,
   stuck, pending sync more than one day, and not picked.
3. NetSuite lists for the mapping dropdowns, read through SuiteQL.
4. A list of records that failed to sync, per flow and store, with send again and resolve.
5. Save a flow's go-live date for a store with a reason, keeping each earlier date. For Orders it writes the date
   into both rule groups, order rules and payment rules, as one change.
6. Save a store's choice of optional steps, and create the store's jobs for them, paused.
7. Switch a flow on or off for a store, in the step order, and record who did it and which setup items were missing.
   A job shared by all stores starts once and stops only when no store uses it.
