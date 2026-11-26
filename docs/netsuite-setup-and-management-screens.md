# NetSuite setup and management screens

## 1. Overview

### 1.1 Objective

One NetSuite area in the Company app, where a Customer Success Manager sees all of a client's
NetSuite subsidiaries. A subsidiary is one company of the client inside its NetSuite account, such
as US or Canada. Each subsidiary has one OMS product store. The Customer Success Manager sets up
the integration one subsidiary at a time, and checks every day that it works.

### 1.2 Problem

Today a Customer Success Manager has no single place that says what is set up, what is missing,
and what is broken.

- The NetSuite page is a list of setting buttons. Nothing says what to do first, or what is done.
- The NetSuite login is entered in an old Moqui admin screen, outside the Company app.
- NetSuite location ids are set one facility at a time, on each facility's page.
- Jobs are switched on in a generic job screen, in an order that lives in a document.
- A client with several subsidiaries, such as US, Canada and EU, each with its own OMS store,
  cannot see one subsidiary's setup apart from the others.
- After go-live there is one count card, which shows "Unavailable", and the order push rules. Records
  that failed to sync cannot be seen.

### 1.3 Success criteria

- A Customer Success Manager sets up a new client without leaving the Company app.
- Any colleague sees the same setup state, because it is read from the server.
- A record that failed to sync is found, fixed and sent again from the app.

## 2. Scope

### 2.1 In scope

The six screens below, and the server additions they need.

### 2.2 Out of scope

- Deploying NetSuite scripts. The NetSuite Admin does that in NetSuite.
- The Shopify side of each flow. It stays in the Shopify area.

## 3. Background

The requirements are three setup stories in mantle-netsuite-connector:

- [Setting up NetSuite for a new client](https://github.com/hotwax/mantle-netsuite-connector/blob/main/docs/new-client-setup/setting-up-netsuite.md)
- [Setting up products for a new client](https://github.com/hotwax/mantle-netsuite-connector/blob/main/docs/product-data/setting-up-products.md)
- [Setting up inventory for a new client](https://github.com/hotwax/mantle-netsuite-connector/blob/main/docs/inventory/setting-up-inventory.md)

A client has more than one subsidiary in NetSuite. Each subsidiary has one product store in the
OMS. The setup story switches on the jobs one store at a time (step 10). So the user first chooses
a subsidiary, then works on its store's flows. The NetSuite connection is shared by all
subsidiaries. Each flow of a store has its own go-live date. HotWax moves it when a new version of
that flow's sync is released.

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
| Product Store and subsidiary | Only the old order file feed | Rework as the link between each subsidiary and its store, on the NetSuite home |
| Price level | Only the old order file feed | Check whether the current push needs it |
| Discounts | Only one client's old return sync | Rework to save the default discount item the current push reads |
| Sales Channel | No reader found in the connector or client code | Check before keeping |

## 4. The screens

Each screen says who opens it, what they want to know in that order, and where the page answers it.

### 4.1 NetSuite home

Replaces today's NetSuite page. It lists the client's subsidiaries. The user picks one to work on.

Opened by the Customer Success Manager, during setup and every day.

#### The story: working on a client's NetSuite subsidiaries

1. The client's NetSuite Admin gives the Customer Success Manager the NetSuite account and its
   login.
2. The Customer Success Manager records the login once. All subsidiaries share it.
3. The Customer Success Manager reviews the client's subsidiaries, as NetSuite lists them. Example:
   US (1), Canada (5), EU (7).
4. The Customer Success Manager links each subsidiary to its OMS product store. Example: US (1) to
   "US Store".
5. Company marks a subsidiary with no linked store as "No store linked".
6. Every day, the Customer Success Manager reviews all subsidiaries together, to see which one has
   failures.
7. The Customer Success Manager chooses one subsidiary and opens it.
8. Company shows that subsidiary's flows: on, paused or setup required, and what failed to sync
   today.

Step 1 happens outside the app. Step 2 is the Connection page (4.3). Steps 3 to 7 happen on this
page. Step 8 is the subsidiary page (4.2).

| Question, in order | Where the page answers it |
|---|---|
| Is the OMS connected to NetSuite, sandbox or production? | Top card, shared by all subsidiaries: "Connected to sandbox 1234567-sb1, tested 22 Nov", or "Not connected", with a Connect button |
| Which subsidiaries does this client have? | A list of subsidiaries, by name and NetSuite id, such as US (1) |
| Which OMS store is each one? | Each row shows its linked store, or "No store linked" with a Link button |
| Which one needs me today? | Each row shows its flows' state and today's failures |
| How do I work on one? | Tap the row. It opens that subsidiary's page with its flows (4.2) |
| Where are the shared settings? | A "Configuration" section: Connection (4.3), File server (SFTP), mappings (4.5) |

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ NetSuite                                                         │
├──────────────────────────────────────────────────────────────────┤
│ Connected to sandbox 1234567-sb1, tested 22 Nov                  │
│                                                                  │
│ Subsidiaries                                                     │
│ Subsidiary  Store           Flows                  Failed today  │
│ US (1)      US Store        4 on, 1 paused               3  ›    │
│ Canada (5)  Canada Store    2 on, 3 setup required       0  ›    │
│ EU (7)      No store linked                       [Link]         │
│                                                                  │
│ Configuration                                                    │
│ Connection · File server (SFTP) · Mappings                       │
└──────────────────────────────────────────────────────────────────┘
```

- The top card is shared by all subsidiaries.
- Each row is one subsidiary, with its name and NetSuite id.
- "Link" lets the user pick the OMS product store for that subsidiary.
- Tapping a row with a store opens its subsidiary page (4.2).

### 4.2 Subsidiary page

One page per subsidiary. It sits between the NetSuite home and the flow pages. It shows the flows
of the subsidiary's linked store.

Opened by the Customer Success Manager, from a row on the NetSuite home.

The title names the subsidiary and its store, such as "US (1) · US Store".

| Question, in order | Where the page answers it |
|---|---|
| Which flows of this store are on? | One status card per flow, in sections: "Products and Inventory" (Products, Stock, Transfers), "Orders and fulfillment" (Orders, Shipments from NetSuite), "Returns". Each card shows On, Paused or Setup required |
| When did each flow last run? | Each card shows the last run |
| What failed to sync today? | Each card shows what is pending sync and what failed to sync today |
| What still needs setting up? | A "Setup required" badge on the flow card, with the count of missing steps, such as "2 of 6 missing" |
| How do I work on one flow? | Tap the card. It opens that flow's page, such as Orders (4.4) |

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ←  US (1) · US Store                                             │
├──────────────────────────────────────────────────────────────────┤
│ Products and Inventory                                           │
│ Flow          State             Last run  Pending  Failed today  │
│ Products      [On]              10:15        0          0        │
│ Stock         [On]              10:00        0          0        │
│ Transfers     [Setup required]  2 of 6 missing                   │
│                                                                  │
│ Orders and fulfillment                                           │
│ Orders        [On]              10:30       12          3        │
│ Shipments     [Paused]          22 Nov       4          0        │
│ from NetSuite                                                    │
│                                                                  │
│ Returns                                                          │
│ Returns       [Setup required]  4 of 6 missing                   │
└──────────────────────────────────────────────────────────────────┘
```

- Each row is one flow card. The arrow goes back to the NetSuite home.
- A flow that is not set up shows its count of missing steps in place of the counts.

### 4.3 Connection

A page under Configuration, like Shopify's "API credentials".

Opened by the Customer Success Manager, with the client's NetSuite Admin.

| Question, in order | Where the page answers it |
|---|---|
| Which NetSuite account is this, sandbox or production? | The account id field, with a Sandbox or Production label read from the id |
| Is the login right? | Four fields (account id, consumer key, certificate id, private key) and a "Test connection" button. The result shows next to the button |
| Can the OMS see what it needs? | After a good test, the page lists any HotWax script or field that the client's NetSuite does not have, by name, such as `custbody_hc_order_id` |

### 4.4 Flow page: Orders

The Orders flow page, one per store. The user reaches a store through its subsidiary page (4.2).
It is the first flow page. The other flows use the same layout when their turn comes.

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
| Is it working? | After switch-on, four counts for each step, each linking to its list (4.6) |

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

1. The NetSuite login is saved and tested. All stores share it. Link: Connection (4.3).
2. Products have NetSuite item ids. Shows how many do not. Link: the Products flow.
3. Stores and warehouses have NetSuite location ids. Shows which do not.
4. Shipping methods, payment methods, tax codes and special items are mapped. Shows how many OMS
   values have no match. Link: Mapping page (4.5).
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

Each count links to its list (4.6).

#### Layout

The page has two modes, as Shopify's Inventory sync and Order sync pages do. The title bar shows
the flow and the store, such as "Orders · US", with the flow's state as a badge.

During setup, the page shows "Setup required" and splits in two, as Inventory sync's first-time
setup does:

```
┌──────────────────────────────────────────────────────────────────┐
│ ←  Orders · US                                  [Setup required] │
├──────────────────────┬───────────────────────────────────────────┤
│ Progress             │ Go-live date                       [Done] │
│ 5 of 8 setup steps   │ Orders and payments before this date      │
│ complete             │ never go to NetSuite.                     │
│                      │                                           │
│ 1 Choose steps    ✓  │ Orders placed after 1 Dec 2026     [Edit] │
│ 2 Go-live date    ✓  │ Also: only orders from the web            │
│ 3 NetSuite login  ✓  │ sales channel              Set by HotWax  │
│ 4 Product ids     !  │                                           │
│ 5 Locations       ✓  │ Date history                              │
│ 6 Mappings        !  │ 1 Dec 2026: set by Priya, 24 Nov,         │
│ 7 Templates       ✓  │ first go-live                             │
│ 8 Switch on       ○  │                          [Back]  [Next]   │
└──────────────────────┴───────────────────────────────────────────┘
```

- The left side is the step list. Steps 1 and 2 are the store's choices. Steps 3 to 7 are the
  setup list. Step 8 is the "Switch on" button.
- Each step shows done (✓), missing (!) or not started (○). A missing step is a warning, not a block.
- The right side is one card for the chosen step, with "Back" and "Next".
- On a phone, the step list becomes a step picker above the card.

After switch-on, the badge shows "On" and a "Pause" button. The page shows, top to bottom:

```
┌──────────────────────────────────────────────────────────────────┐
│ ←  Orders · US                                   [On]  [Pause]   │
├──────────────────────────────────────────────────────────────────┤
│ ! Switched on with 2 setup items missing: 14 products have no    │
│   NetSuite id, 1 payment method has no match.                    │
│                                                                  │
│ Steps                                          Last run 10:30    │
│ Step                     Failed  Stuck  >1 day  Not picked       │
│ Customer                   0       0      0        0             │
│ Sales order                3       0     12        2             │
│ Payment                    0       0      5        0             │
│ Exchange payment           0       0      0        0             │
│ Refund                     0       0      0        0             │
│ Store shipment             0       0      0        0             │
│ Cancelled line [Shared by all stores]                            │
│                            0       0      0        –             │
│ Order change · off         –       –      –        –             │
│ Order moved · off          –       –      –        –             │
│                                                                  │
│ Key dates                       │ Setup                          │
│ Go-live: orders placed after    │ Product ids       14 missing   │
│ 1 Dec 2026               [Edit] │ Mappings           1 missing   │
│ Switched on: Priya, 1 Dec 2026  │ Login, locations,              │
│                                 │ templates               Done   │
└──────────────────────────────────────────────────────────────────┘
```

- The banner shows only while a setup item is missing.
- The steps card has one row per step and the four counts. A count above zero is colored: red for
  "Failed", amber for the others. Each count opens its list (4.6).
- A step the store does not send is greyed out, with "off" and dashes.
- A step shared by all stores carries the "Shared by all stores" label. Its "Not picked" count is a
  dash, because it has no store rules.
- "Key dates" and "Setup" sit side by side, and stack on a phone.

#### Screens in the app

The flow's workflow lives in the app's code, not in the database. No data row lists a flow's
steps, their order, or what each step shows. The screens know them.

The page follows the app's Product sync pattern:

1. One route per flow and store: `/netsuite/stores/:productStoreId/orders`.
2. The page loads one of two sub-screens. Before switch-on it loads the setup view. After switch-on
   it loads the monitoring view.
3. The setup view holds the 8 setup steps as a fixed list in code. Each step is its own component.
   Picking a step loads its component beside the list.
4. The monitoring view holds the 9 Orders steps as a fixed list in code. Each row is its own
   component, and asks the server for its own counts.
5. A count opens that step's "Failed to sync" list (4.6), on its own route. A small detail, such as
   one record's error, opens in a modal.

Inventory sync puts its setup and monitoring in one large view. The Orders page keeps them apart,
as Product sync does.

### 4.5 Mapping page

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

### 4.6 Failed to sync

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
2. One counts call per step, for one store: on or off, last run, and the four counts: failed to sync, stuck, pending
   sync more than one day, and not picked. Sales order is the first; see 5.1.
3. NetSuite lists for the mapping dropdowns, read through SuiteQL.
4. A list of records that failed to sync, per flow and store, with send again and resolve.
5. Save a flow's go-live date for a store with a reason, keeping each earlier date. For Orders it writes the date
   into both rule groups, order rules and payment rules, as one change.
6. Save a store's choice of optional steps, and create the store's jobs for them, paused.
7. Switch a store's jobs on or off, in the order the page sends them, and record who did it and which setup items
   were missing. A job shared by all stores starts once and stops only when no store uses it.
8. The list of the client's subsidiaries, read from NetSuite, with each one's name and id.
9. Save the link between a subsidiary and its OMS product store.

Open for design: the code keeps a store's subsidiary id in two places today. The current NetSuite
page and the old order feed read the product store's external id. The newer connector order views
read the external id of the store's "pay to" party (view `ProductStoreSubsidiaryView` in
mantle-netsuite-connector). The System Architect decides which one the link writes.

### 5.1 Sales order counts

The first counts call. The other steps follow the same pattern, one at a time.

Example: the Sales order row asks for store US. The answer is: on, last run 10:30, failed to sync
3, stuck 0, pending sync more than one day 12, not picked 2.

How the server answers:

1. It finds the store's sales order job: the job for `create#NetSuiteSalesOrderBatch` whose
   `productStoreId` setting is the store. The job's settings name its rule group and its due view.
   A client may name its own due view.
2. It counts orders, not rows. A due view can hold more than one row for one order, such as one
   per ship group.
3. Each count:

| Count | Orders counted |
|---|---|
| Failed to sync | The sync record holds an error and no NetSuite order id |
| Stuck | The sync record has no NetSuite order id and no error, and its batch was sent over one day ago |
| Pending sync more than one day | In the due view for the store, picked by the store's rules, and placed over one day ago |
| Not picked | In the due view for the store, placed after the go-live date, and picked by no rule |

4. The go-live date is the earliest order date in the store's active rules. When a rule has no
   date, "Not picked" is left empty.
5. "On" means the job is not paused and is inside its from and thru dates. "Last run" is the job's
   newest run.

What is built:

- In oms: one service that turns a rule group into one condition, the rules joined by "or".
  `find#IdsByRuleGroup` and the counts both use it, so the jobs and the page read rules the same
  way.
- In mantle-netsuite-connector:
  - A view that joins the sales order sync record (`NetSuiteSalesOrderDetail`) to its order, for
    the store, and to its batch message, for the date the batch was sent.
  - A view that joins a job to its settings, to find the store's job.
  - A read-only service and a REST call for the counts, such as
    `GET netsuite/salesOrders/counts?productStoreId=STORE`.

The call reads only. It claims, writes and sends nothing.

The design was reviewed by the Moqui architect on 24 Nov 2026. How fast the counts run on
production data is not tested yet.
