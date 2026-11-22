# NetSuite setup and management screens

## 1. Overview

### 1.1 Objective

One NetSuite area in the Company app, where a Customer Success Manager sets up a client's NetSuite
integration and checks every day that it works.

### 1.2 Problem

Today a Customer Success Manager has no single place that says what is set up, what is missing,
and what is broken.

- The NetSuite page is a list of setting buttons. Nothing says what to do first, or what is done.
- The NetSuite login is entered in an old Moqui admin screen, outside the Company app.
- NetSuite location ids are set one facility at a time, on each facility's page.
- Jobs are switched on in a generic job screen, in an order that lives in a document.
- After go-live there is one count card, which shows "Unavailable", and the order push rules. Records
  NetSuite refused cannot be seen.

### 1.3 Success criteria

- A Customer Success Manager sets up a new client without leaving the Company app.
- Any colleague sees the same setup state, because it is read from the server.
- A refused record is found, fixed and sent again from the app.

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

The screens follow the app's Shopify area, so users meet patterns they already know:

- The Shopify connection page has a "Configuration" section, then one section per area, with a
  status card for each main flow and link cards below it.
- Each Shopify flow page opens with a setup step list (Inventory sync: "0 of 4 setup steps
  complete"), then shows monitoring, key dates, history and job runs.
- Order sync creates its job paused, and an administrator activates it.

They also take three habits from Celigo, the tool many NetSuite clients use for Shopify and NetSuite:

- Each flow shows at a glance whether it is on, when it last ran, and how many records failed.
- Values are mapped by picking NetSuite's own records by name, not by typing internal ids.
- Each failed record can be sent again, or resolved with a note.

What the current NetSuite page settings feed today:

| Page | Read today by | Place in the new screens |
|---|---|---|
| Orders pending sync | The current order push queue | Orders flow card |
| Order sync monitoring | The current order push rules | Orders flow page |
| Shipping methods, Payment method, Departments | Current order, deposit and return code | Mapping pages under their flows |
| SFTP | NetSuite scripts that write files | Configuration |
| Inventory variances | The store adjustment job (the reasons only) | Stock flow |
| Product Store and subsidiary | Only the old order file feed | Rework as Configuration, Product stores, for more than one store |
| Price level | Only the old order file feed | Check whether the current push needs it |
| Discounts | Only Gorjana's old return sync | Rework to save the default discount item the current push reads |
| Sales Channel | No reader found in the connector or Gorjana code | Check before keeping |

## 4. The screens

Each screen says who opens it, what they want to know in that order, and where the page answers it.

### 4.1 NetSuite home

Replaces today's NetSuite page. Same layout as the Shopify connection page.

Opened by the Customer Success Manager, during setup and every day.

| Question, in order | Where the page answers it |
|---|---|
| Is the OMS connected to NetSuite? | Top card: "Connected to sandbox 4054670-sb1, tested 22 Nov", or "Not connected", with a Connect button |
| Which flows are on, and is any in trouble? | One status card per flow, in sections: "Products and Inventory" (Products, Stock, Transfers), "Orders and fulfillment" (Orders, Shipments from NetSuite), "Returns". Each card shows On, Paused or Setup required, the last run, what is waiting, and what was refused today |
| What still needs setting up? | A "Setup required" badge on the flow card, with the count of missing items, such as "2 of 6 missing" |
| Where do I change a setting? | The "Configuration" section: Connection, Product stores and subsidiaries, File server (SFTP), NetSuite catalog |

### 4.2 Connection

A page under Configuration, like Shopify's "API credentials".

Opened by the Customer Success Manager, with the client's NetSuite Admin.

| Question, in order | Where the page answers it |
|---|---|
| Which NetSuite account is this, sandbox or production? | The account id field, with a Sandbox or Production label read from the id |
| Is the login right? | Four fields (account id, consumer key, certificate id, private key) and a "Test connection" button. The result shows next to the button |
| Can the OMS see what it needs? | After a good test, the page lists any HotWax script or field that the client's NetSuite does not have, by name, such as `custbody_hc_order_id` |

### 4.3 Flow page

One layout for every flow. Orders is the example.

Opened by the Customer Success Manager.

| Question, in order | Where the page answers it |
|---|---|
| Is this flow ready to switch on? | While setup is open, the step list on the left, as on Shopify's Inventory sync. For Orders: shipping methods, payment methods, departments, special items, go-live date. Each step is marked done or missing |
| What date does it start from? | A "Key dates" card with the go-live date, as on Shopify's Order sync |
| Is it on? | An "Activate" button. The jobs are created paused first. An administrator activates them, and they start in the right order |
| Is it working? | After activation, metric cards: last run, waiting, refused, and older than one day |
| What went wrong? | The flow's refused records (4.5) and its job runs |

### 4.4 Mapping page

One layout for shipping methods, payment methods, discounts, tax codes and special items such as
the gift card.

Opened by the Customer Success Manager, or the client's NetSuite Admin.

| Question, in order | Where the page answers it |
|---|---|
| Which OMS values still have no NetSuite match? | A list of OMS values, unmatched first, with a count at the top: "3 of 10 not mapped" |
| What is the NetSuite match? | A dropdown of NetSuite's own records by name and id, read live from NetSuite, such as "Standard (2830)" |
| Is a saved match still valid? | A warning on a row whose NetSuite record is gone or inactive |

### 4.5 Refused records

One per flow.

Opened by the Customer Success Manager, every day.

| Question, in order | Where the page answers it |
|---|---|
| Which records did NetSuite refuse? | A list: the record, such as an order id, when it was sent, and NetSuite's message |
| What do I do about each one? | "Send again" after the data is fixed, or "Resolve" with a note when no resend is needed |
| Is anything stuck without an error? | A "Waiting more than one day" filter |

## 5. What the server must add

1. A REST endpoint that saves the NetSuite login and tests the connection. Today this exists only
   in the Moqui admin screen.
2. One status call per flow: on or off, last run, waiting, refused, and missing setup.
3. NetSuite lists for the mapping dropdowns, read through SuiteQL.
4. A list of single refused records, with send again and resolve.
