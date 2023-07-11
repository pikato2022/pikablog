---
title: 'Google File System: When It comes to big data processing'
date: '2023-07-08'
tags: ['GFS', 'Distributed System', 'Google']
draft: false
summary: This is a summary of Google File System paper. It gives you a detailed idea how Google scales/optimize their system to deal with Pbs of data. This paper is very old, but the key design's still fundamental for big data DFS (Distributed System) nowaday.
images: []
layout: PostLayout
canonicalUrl:
---

This is a summary of Google File System paper. It gives you a detailed idea how Google scales/optimize their system to deal with Tbs of data. This paper is very old, but the key design's still fundamental for big data DFS (Distributed System) nowaday.

# I. Architecture

![GFS Architecture](/static/images/gfs/gfs_architect.png)

## 1. Assumption/ System characteristic

- Modest number of large files
- Read oriented system: Write one, read many time
- 2 kinds of read: streaming read and small random read. While streaming read huge amounts of data (> 1Mb, a region/ continues in region).. Small random read is supported but not optimized
- Well-defined semantics: allow multiple clients append data to the same file concurrently with minimal overhead
- High sustained bandwidth is more important than low latency: focus on big data processing not response rate

## 2. Key Designs

### 2.1 Single Master

- A single master simplify design for place block and its replication
- But can be a single point of failure. To minimize this: Master won't be minimally involved in read and write operation.
- How to read: client sent request (file, chunk index)=> Master return chunk and its replica location=> client connect to slave to read data (closest slave)

### 2.2 Chunk size (large)

| Advantage                                                                                              | Disadvantage                                        |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Minimize master involve (as bigger size=> less chunk=> less communicate with master for chunk location | Hot pot issue (small file that many clients access) |
| Reduce network overhead(less new connection=> less overhead)                                           |                                                     |
| Reduce metadata size (less no of chunk=> less metadata                                                 |                                                     |

### 2.3 Metadata (chunk namespace, file chunk mapping, chunk's replica location)

- Store in Master in-memory only=> make master operation fast. Metadata can be large but in practical, It doesn’t happen
- Chunk location is not persistent in the master’s disk. but retrieve everytime master start up => maintain consistency between master and chunk server, as error in chunk server can cause vanish chunk spontaneously

### 2.4 Operation log (historical records of metadata changes)

- Persistence: change be seen after commit (current and remote)
- Checkpoint state: keep the log small. => minimize start-up time. State recover by loading latest checkpoint from local disk and replaying only limited numbers of log records after that. (Older checkpoint can be freely deleted. failure in checkpoint not affect correctness due to recovery code detect error and skip faulty checkpoint

### 2.5 Consistency Model

#### 2.5.1 Guarantee by GFS

![File Region after mutation](/static/images/gfs/file_region.png)

- Types of states
  - Defined: change can be seen and consistent between diff client
  - Consistent but undefined: Data is consistent between diff client but change cant be seen
  - Inconsistent: Data is not same between different client
- Write: data to be written at application-specified offset
- Data corruption is detected by checksumming=> sending handshake to master. Once detected, data is rollback to valid replica asap, if can’t then data become unavailable
- Record append: data to be written at GFS’s choosing offset (atomically)

#### 2.5.2 Implication of Applications (to deal with relaxed consistency model)

- Relying on append rather than overwrite
- Checkpointing ( to continue writing from last checkpoint)
- Writing self-validating (using checksum to identify and discard extra padding and record fragments)
- Self-identifying records

# II. System interaction

Chunk Lease: to maintain consistent mutation order across replica
Mutation: write/ record append request

## 1. Lease and Mutation Order (How write flow work in GFS)

![Write Flow and Data flow](/static/images/gfs/write_flow.png)

- **First**, client ask master which chunk server hold current lease for the chunk and location of its replica. If no one has lease then master will grant one
- **Second**, master send client primary chunkserver and other replica location. master grant a chunk lease to primary chunk server (between all replicas of requested chunk. Global mutation order is defined fist by the lease grant order by master and within a lease by the serial numbers by primary. If primary unreachable, client ask master again
- **Third**, Client push data to all replicas in any orders
- **Fourth**, once all replica ack to receive data. Client send write request to primary chunk server. With data received, the primary assign consecutive serial number to all mutations it received (in case many mutation modify same chunk)=> apply this order to make change in local
- **Fiveth**, Once done, primary forward write request to other replica (secondary). Each replica apply mutation in same order assigned by the primary
- **Sixth**, Once done, all secondary will reply/ack to the primary that operation completed
- **Seventh**, primary reply client, if operation success or failure. If failed (in replica) then retry step 3-7 => if still failed then fall back to step 1

**Note**: If write request is too large=> break down to multiple write =>follow same flow.=> Shared file region end up fragment as modified by diff clients=> File regions in consistent but undefined state

## 2. Data flow

- Data flow is decoupled from control flow to use the network efficiently.
- Data is pushed forward from nearest chunkserver.
- Data latency is minimized by pipelining data transfer over TCP. That means one a chunk server received data, it start pushing data.

## 3. Atomic record append

- If record append size is too large, primary chunk server will pad the chunk to max size and ask client to retry in next trunk (a request size maximum ¼ chunk size, keeping fragmentation size acceptable). If size ok, primary append data to its replica and tell them to write data at exact offset => send success response to client
- If record append failed, client retries operation. As a result, the data between replica may duplicate, GFS doesn’t guarantee all replica are bytewise identical but guarantee all data written at least once. For dealing with undefined, using method in 2.5.2

## 4. Snapshot

**Snapshot**: make a copy of a file or directory with minimize interruption of ongoing mutation

- First, (COPY ON WRITE) master received a snapshot request =>revoke/cancel any outstanding lease
- Master log operation to disk=> apply to its in-memory state by duplicating metadata=> newly duplicated snapshot point to same chunk as source file
- After that, when client want to write to chunk C=> master notice reference count to chunk C> 1 => defer replying to the client and pick a new chunk C’=> replicate it (reduce data transfer in network)

# III. Master Operation

## 1. Namespace Management and Locking

- Multiple Master operations can be executed simultaneously, as GFS use locks over regions of namespace to ensure proper serialization
- GFS represent its namespace as a lookup table mapping full pathnames to metadata
- Each master acquire a set of locks before it runs. Read lock prevent directory from deleted/rename/snapshot. Write lock make sure file creation in sequence

## 2. Replica replacement policy

- Make sure data reliability and availability, maximize network, bandwidth utilization
  =>replica spread across machine/racks

## 3. Creation, Re-replication, rebalancing

- Creating chunk factor to consider:
  - Place where below average disk-utilization
  - Limit number of recent creation on each chunk server
  - Spread chunk replica across rack
- Re-replicate (when number of replica under goal) prioritize
  - Less replica higher prirority
  - Chunk for live file > chunk of recent deleted file
  - Boost priority of any chunk that block client progress
- Rebalance replica periodically: remove those on chunkserver with below-average free space to equalize disk space usage

## 4. Garbage collection

- Soft delete file => can rollback by rename hidden file
- Orphaned chunk can be detect by master regularly by heartbeat message=> will be erased from in-memory metadata

## 5. Stale replica detection

- Keep track by saving a chunk version number
- When a new lease grant, chunk version number ++. before any request, make sure chunk version number is correct.
- Stale chunk will be detect regularly by garbage collection
- Master also send chunk version number to client=> client or chunk server can verify if chunk version number is up-to-date

# III. Fault tolerance and diagnosis

## 1. High availability

- **Fast recovery**: no different between normal and abnormal startup
- **Chunk replication**
- **Master replication** : operation log has replica and shadow master also start up to update the log same with primary master (except it’s only copy data without communicate with client)

## 2. Data integrity

Each chunkserver use checksumming to detect corruption of stored data (by their own). Chunk is broken by 64kbBlock and each block has 32 bit checksum=> keep in-memory-> persistent with logging and separate from user data

## 3. Dianogtic tool

Logging for significant events(chunk server up/down, RPC requests and replies).

That's it. I hope you can get the gist of DFS through this summary.
You can check out original paper [here](https://static.googleusercontent.com/media/research.google.com/en//archive/gfs-sosp2003.pdf)
