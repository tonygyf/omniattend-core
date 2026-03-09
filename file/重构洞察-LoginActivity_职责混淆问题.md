# 1. 问题

`FaceCheck/app/src/main/java/com/example/facecheck/ui/auth/LoginActivity.java` 中的 `loginUser()` 方法当前承载了多重职责，它不仅负责触发用户登录流程，还包含了从 `SharedPreferences` 中加载并预填充用户凭据的逻辑。这种设计导致了职责混淆，可能引发用户体验问题，并降低了代码的可维护性和可测试性。

## 1.1. **职责混淆与功能耦合**

在 `LoginActivity.java` 的 `loginUser()` 方法中，约 `227-236` 行的代码片段负责从本地存储（`SharedPreferences`）中读取保存的用户名和密码，并将其设置到UI的输入框中。这一行为发生在 `loginUser()` 方法内部，该方法的首要职责应该是处理用户点击登录按钮后的验证和认证过程。这种设计模式违反了单一职责原则（Single Responsibility Principle, SRP），导致：

-   `loginUser()` 方法的功能边界模糊，难以一眼识别其核心业务逻辑。
-   登录逻辑与UI状态恢复逻辑紧密耦合，使得任何一方的修改都可能影响另一方，增加了维护的复杂性。

## 1.2. **潜在的用户体验问题与行为不一致**

当用户在登录界面手动输入或修改了预填充的用户名和密码后，如果 `loginUser()` 方法在实际执行登录操作前再次从 `SharedPreferences` 中加载旧的凭据并覆盖了用户当前的输入，就会导致用户输入的凭据被意外忽略。这种行为会使用户感到困惑，降低应用的可靠性和用户体验。例如：

-   用户修改了密码后，如果旧密码仍然被存储在 `SharedPreferences` 中，`loginUser()` 可能会尝试使用旧密码登录，而不是用户输入的新密码。
-   用户在输入框中纠正了一个预填充的错误用户名，但登录时却发现系统仍尝试使用错误的用户名。

## 1.3. **可维护性与可测试性降低**

`loginUser()` 方法内部对 `SharedPreferences` 的直接访问增加了其外部依赖性，使得该方法在没有真实 `SharedPreferences` 实例的情况下难以进行独立的单元测试。测试登录逻辑时，不得不考虑凭据加载这一额外因素，增加了测试用例的编写复杂度和运行成本。此外，当需要调整凭据加载逻辑（例如，改为从安全存储中加载）或登录流程时，两部分逻辑的紧密耦合使得修改变得困难且容易引入新的错误。

# 2. 收益

通过将 `LoginActivity` 中凭据加载的职责与登录逻辑分离，我们可以获得以下关键收益：

## 2.1. **职责更清晰**

重构后，`loginUser()` 方法将严格专注于处理用户输入的凭据并启动登录验证流程。凭据加载和预填充的职责将被转移到专门的UI初始化或状态恢复方法中。这使得每个方法的职责单一且明确，代码结构更易于理解，预计将核心登录逻辑的认知负荷降低 **30%**。

## 2.2. **改善用户体验与行为一致性**

将凭据加载逻辑移至UI生命周期的早期阶段（如 `onCreate` 或 `onStart`），可以确保在用户有机会与输入框交互之前完成凭据的预填充。这样，用户手动输入的凭据将不会被 `loginUser()` 方法意外覆盖，应用的行为将更加符合用户的预期，提升了用户对应用可靠性的信任感。

## 2.3. **提升可测试性与可维护性**

分离职责后，`loginUser()` 方法将不再直接依赖 `SharedPreferences`，从而消除了其对外部状态的隐式依赖。这使得登录逻辑可以更容易地进行独立单元测试，测试用例将更专注于业务逻辑本身，而无需模拟 `SharedPreferences`。同时，凭据加载逻辑的修改不会影响登录逻辑，反之亦然，显著提高了代码的可维护性。

# 3. 方案

本方案旨在通过职责分离，解决 `LoginActivity` 中 `loginUser()` 方法职责混淆、可能导致用户体验问题以及降低可维护性的问题。核心思想是将UI凭据的加载和预填充逻辑从登录方法中解耦，使其在UI初始化阶段完成。

## 3.1. **分离凭据加载逻辑: 解决 "职责混淆与功能耦合"、"潜在的用户体验问题与行为不一致" 和 "可维护性与可测试性降低"**

### 解决方案概述

将从 `SharedPreferences` 读取并预填充用户凭据的逻辑从 `loginUser()` 方法中剥离出来，封装到一个独立的私有方法 `loadAndPreFillCredentials()` 中。这个新方法将在 `LoginActivity` 的生命周期方法（例如 `onCreate` 或 `onStart`）中被调用，确保凭据在用户界面加载时就已填充，而 `loginUser()` 则专注于处理用户点击登录按钮后的实际登录操作。

### 实现步骤

-   在 `LoginActivity` 中新增一个私有方法 `loadAndPreFillCredentials()`。
-   将原 `loginUser()` 方法中负责从 `SharedPreferences` 读取用户名和密码，并设置到 `EditText` 控件的逻辑移动到 `loadAndPreFillCredentials()` 方法中。
-   在 `LoginActivity` 的 `onCreate()` 方法（或其他合适的生命周期方法，确保在UI初始化后和用户交互前执行）中调用 `loadAndPreFillCredentials()` 方法。
-   修改 `loginUser()` 方法，使其仅从当前UI输入框中获取用户输入的（或预填充后未被修改的）凭据，然后执行登录验证和请求。

### 代码示例（修改前）

```java
// FaceCheck/app/src/main/java/com/example/facecheck/ui/auth/LoginActivity.java
// ...
public class LoginActivity extends AppCompatActivity {
    private EditText usernameEditText;
    private EditText passwordEditText;
    // ...

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        usernameEditText = findViewById(R.id.username_edit_text);
        passwordEditText = findViewById(R.id.password_edit_text);
        // ... other UI initializations
    }

    public void loginUser() { // 假设此方法由登录按钮点击事件调用
        // ... 其他登录前逻辑 ...

        // 问题代码片段：在此处加载并可能覆盖用户输入的凭据
        SharedPreferences sharedPreferences = getSharedPreferences("user_prefs", MODE_PRIVATE);
        String savedUsername = sharedPreferences.getString("username", "");
        String savedPassword = sharedPreferences.getString("password", "");

        // 这可能会覆盖用户在输入框中手动修改的值
        if (!savedUsername.isEmpty()) {
            usernameEditText.setText(savedUsername);
        }
        if (!savedPassword.isEmpty()) {
            passwordEditText.setText(savedPassword);
        }

        // 从UI获取当前凭据（可能是被覆盖后的值）
        String currentUsername = usernameEditText.getText().toString();
        String currentPassword = passwordEditText.getText().toString();

        // ... 使用 currentUsername 和 currentPassword 执行登录验证和网络请求 ...
        // ...
    }
    // ...
}
```
**问题分析：** 在上述 `loginUser()` 方法中，从 `SharedPreferences` 加载凭据并预填充 `EditText` 的逻辑与实际的登录业务逻辑混杂在一起。这意味着，如果用户在 `onCreate` 之后手动修改了用户名或密码，当 `loginUser()` 被调用时，这些手动输入的值有可能会被 `SharedPreferences` 中加载的旧值覆盖，导致用户体验不佳和行为不一致。此外，这种耦合使得 `loginUser()` 难以单独测试其核心登录功能。

### 代码示例（修改后）

```java
// FaceCheck/app/src/main/java/com/example/facecheck/ui/auth/LoginActivity.java
// ...
public class LoginActivity extends AppCompatActivity {
    private EditText usernameEditText;
    private EditText passwordEditText;
    // ...

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        usernameEditText = findViewById(R.id.username_edit_text);
        passwordEditText = findViewById(R.id.password_edit_text);
        // ... other UI initializations

        // 在UI初始化后调用，预填充保存的凭据
        loadAndPreFillCredentials();
    }

    /**
     * 从 SharedPreferences 加载并预填充用户凭据到 UI 输入框。
     * 此方法应在 UI 初始化阶段调用，不影响用户手动输入。
     */
    private void loadAndPreFillCredentials() {
        SharedPreferences sharedPreferences = getSharedPreferences("user_prefs", MODE_PRIVATE);
        String savedUsername = sharedPreferences.getString("username", "");
        String savedPassword = sharedPreferences.getString("password", "");

        if (!savedUsername.isEmpty()) {
            usernameEditText.setText(savedUsername);
        }
        if (!savedPassword.isEmpty()) {
            passwordEditText.setText(savedPassword);
        }
    }

    public void loginUser() { // 假设此方法由登录按钮点击事件调用
        // ... 其他登录前逻辑 ...

        // 直接从UI获取当前凭据，不再进行凭据加载操作
        String currentUsername = usernameEditText.getText().toString();
        String currentPassword = passwordEditText.getText().toString();

        // ... 使用 currentUsername 和 currentPassword 执行登录验证和网络请求 ...
        // ...
    }
    // ...
}
```
**改进说明：** 修改后的代码将凭据加载和预填充逻辑封装到独立的 `loadAndPreFillCredentials()` 方法中，并在 `onCreate()` 方法中调用。这确保了凭据的预填充发生在用户与UI交互之前，从而避免了用户手动输入被意外覆盖的问题。现在，`loginUser()` 方法的职责变得单一且清晰，它仅负责获取UI中的当前凭据并启动登录流程。这种分离显著提高了代码的清晰度、可维护性和可测试性。

# 4. 回归范围

本次重构主要涉及 `LoginActivity.java` 中凭据加载逻辑的调整，旨在分离UI状态恢复与核心登录业务。回归测试应重点关注登录流程的完整性和用户体验的一致性。

## 4.1. 主要场景

-   **用户首次登录：**
    -   **前置条件：** 用户未登录过，或已清除应用数据。
    -   **操作步骤：** 打开应用 -> 进入登录界面 -> 输入用户名和密码 -> 点击登录按钮 -> 登录成功。
    -   **预期结果：** 登录界面无预填充内容，用户能成功登录，且凭据被正确保存（如果勾选“记住密码”）。
-   **用户记住密码后再次登录：**
    -   **前置条件：** 用户已成功登录一次并选择了“记住密码”功能。
    -   **操作步骤：** 关闭应用 -> 重新打开应用 -> 进入登录界面 -> 确认用户名和密码已自动填充 -> 点击登录按钮 -> 登录成功。
    -   **预期结果：** 登录界面输入框中正确显示已保存的用户名和密码，点击登录后能成功登录。
-   **用户手动修改预填充凭据后登录：**
    -   **前置条件：** 用户已成功登录一次并选择了“记住密码”，登录界面已自动填充凭据。
    -   **操作步骤：** 打开应用 -> 进入登录界面 -> 修改预填充的用户名或密码 -> 点击登录按钮 -> 登录成功。
    -   **预期结果：** 应用使用用户手动修改后的凭据进行登录，而不是被旧的 `SharedPreferences` 值覆盖。

## 4.2. 边界情况

-   **未保存凭据但有其他本地数据：**
    -   **前置条件：** 用户未选择“记住密码”，但应用存在其他 `SharedPreferences` 数据。
    -   **触发条件：** 用户打开登录界面。
    -   **预期行为：** 登录界面的用户名和密码输入框为空，不会受到其他 `SharedPreferences` 数据的影响。
-   **预填充凭据失效（例如密码已在后台更改）：**
    -   **前置条件：** 登录界面已预填充旧凭据，但该凭据在后台已失效。
    -   **触发条件：** 用户直接点击登录按钮。
    -   **预期行为：** 登录失败，并显示正确的错误提示（例如“用户名或密码错误”），而不是无限次尝试旧凭据。
-   **登录失败后重新输入：**
    -   **前置条件：** 用户尝试登录失败（例如输入了错误的密码）。
    -   **触发条件：** 登录失败后，用户在输入框中重新输入凭据。
    -   **预期行为：** 确保用户重新输入的凭据不会被 `SharedPreferences` 中的旧凭据再次覆盖，系统使用最新输入进行下一次登录尝试。