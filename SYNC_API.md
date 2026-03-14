
# Android 客户端增量同步 API 文档

**版本:** 1.0
**基础路径:** `/api/v1`

## 概述

本接口用于安卓客户端高效地获取自上次同步以来发生变更的学生和班级数据。通过使用客户端保存的时间戳 `lastSyncTimestamp`，服务器将只返回此时间戳之后发生变化的数据，包括新增、更新和删除的记录。

## 认证

所有对本接口的请求都必须在 HTTP Header 中包含 `X-API-Key`。

- **Header Name**: `X-API-Key`
- **Header Value**: `(Your API Secret)`

## 核心流程

1.  **首次同步**: 客户端首次请求时，`lastSyncTimestamp` 参数应传 `0`。服务器将返回所有数据，并返回一个 `newLastSyncTimestamp`。
2.  **保存时间戳**: 客户端在每次成功同步后，必须在本地持久化存储服务器返回的 `newLastSyncTimestamp`。
3.  **增量同步**: 后续请求中，客户端需将上次保存的 `newLastSyncTimestamp` 作为 `lastSyncTimestamp` 参数传入，以获取增量变更。
4.  **数据处理**: 客户端根据响应中的 `added`, `updated`, `deleted` 字段，对本地数据库进行相应的增、删、改操作。
5.  **失败重试**: 如果同步请求失败（网络错误或服务器返回非 200 状态码），客户端**不得**更新本地的 `lastSyncTimestamp`，以便下次可以重新同步相同的变更区间。

---

## 1. 学生数据增量同步

获取自上次同步以来发生变更的学生数据。

- **接口路径:** `/api/v1/students/delta`
- **请求方法:** `GET`

### 请求参数

| 参数 | 类型 | 是否必填 | 描述 |
| --- | --- | --- | --- |
| `lastSyncTimestamp` | `number` | 是 | 客户端上次成功同步时从服务器获取的时间戳 (Unix 毫秒)。首次请求请传 `0`。 |
| `pageSize` | `number` | 否 | *（暂未实现）* 每页返回的记录数。 |
| `pageNumber` | `number` | 否 | *（暂未实现）* 请求的页码。 |

### 响应格式 (200 OK)

```json
{
  "newLastSyncTimestamp": 1678886400000,
  "addedStudents": [
    {
      "id": 101,
      "classId": 1,
      "name": "张三",
      "sid": "2023001",
      "gender": "M",
      "avatarUri": "/avatars/101.jpg",
      "createdAt": "2023-03-15T12:00:00Z"
    }
  ],
  "updatedStudents": [
    {
      "id": 56,
      "classId": 2,
      "name": "李四",
      "sid": "2023002",
      "gender": "F",
      "avatarUri": "/avatars/56_new.jpg",
      "createdAt": "2023-03-10T10:00:00Z"
    }
  ],
  "deletedStudentIds": [
    23, 45
  ],
  "hasMore": false,
  "totalChanges": 4
}
```

### 响应字段说明

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `newLastSyncTimestamp` | `number` | **（必填）** 本次同步结束时服务器端的最新时间戳。客户端必须保存此值用于下次请求。 |
| `addedStudents` | `Array<Student>` | 新增的学生对象列表。 |
| `updatedStudents` | `Array<Student>` | 已更新的学生对象列表。 |
| `deletedStudentIds` | `Array<number>` | 已删除的学生 ID 列表。 |
| `hasMore` | `boolean` | 指示是否还有更多数据需要通过分页获取。*（当前版本始终为 `false`）* |
| `totalChanges` | `number` | 本次同步周期内总的变更记录数（`added` + `updated` + `deleted` 的总和）。 |

---

## 2. 班级数据增量同步

获取自上次同步以来发生变更的班级数据。

- **接口路径:** `/api/v1/classes/delta`
- **请求方法:** `GET`

### 请求参数

| 参数 | 类型 | 是否必填 | 描述 |
| --- | --- | --- | --- |
| `lastSyncTimestamp` | `number` | 是 | 客户端上次成功同步时从服务器获取的时间戳 (Unix 毫秒)。首次请求请传 `0`。 |

### 响应格式 (200 OK)

```json
{
  "newLastSyncTimestamp": 1678886400000,
  "addedClasses": [
    {
      "id": 5,
      "teacherId": 1,
      "name": "计算机科学 2024级",
      "year": 2024,
      "meta": null
    }
  ],
  "updatedClasses": [
    {
      "id": 2,
      "teacherId": 1,
      "name": "软件工程 2023级（荣誉班）",
      "year": 2023,
      "meta": "{\"isHonorClass\": true}"
    }
  ],
  "deletedClassIds": [
    3
  ],
  "hasMore": false,
  "totalChanges": 3
}
```

### 响应字段说明

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `newLastSyncTimestamp` | `number` | **（必填）** 本次同步结束时服务器端的最新时间戳。 |
| `addedClasses` | `Array<Classroom>` | 新增的班级对象列表。 |
| `updatedClasses` | `Array<Classroom>` | 已更新的班级对象列表。 |
| `deletedClassIds` | `Array<number>` | 已删除的班级 ID 列表。 |
| `hasMore` | `boolean` | 指示是否还有更多数据。*（当前版本始终为 `false`）* |
| `totalChanges` | `number` | 本次同步周期内总的变更记录数。 |

