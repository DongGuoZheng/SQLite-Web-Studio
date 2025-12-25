// SQL.js 初始化
let SQL;
let db = null;
let currentTable = null;
let currentTableData = [];
let currentTableColumns = [];
let currentTablePk = [];
let allTables = [];
let tableSearchQuery = '';

// 等待 SQL.js 加载
initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
}).then(sql => {
    SQL = sql;
    console.log('SQL.js 加载成功');
    setupEventListeners();
}).catch(error => {
    console.error('SQL.js 加载失败:', error);
    showError('SQL.js 加载失败，请刷新页面重试');
});

// 设置事件监听器
function setupEventListeners() {
    // 文件选择
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    // 导出数据库
    document.getElementById('exportDbBtn').addEventListener('click', exportDatabase);

    // 拖拽功能
    const dropZone = document.getElementById('dropZone');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const fileInput = document.getElementById('fileInput');

    // 点击拖拽框打开文件选择对话框
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        welcomeScreen.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('border-blue-500');
        }, false);
        welcomeScreen.addEventListener(eventName, () => {
            welcomeScreen.style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('border-blue-500');
        }, false);
        welcomeScreen.addEventListener(eventName, () => {
            welcomeScreen.style.backgroundColor = '';
        }, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    welcomeScreen.addEventListener('drop', handleDrop, false);

    // 标签页切换
    document.getElementById('dataTabBtn').addEventListener('click', () => switchTab('data'));
    document.getElementById('structureTabBtn').addEventListener('click', () => switchTab('structure'));

    // 刷新按钮
    document.getElementById('refreshTableBtn').addEventListener('click', () => {
        if (currentTable) {
            const limitSelect = document.getElementById('limitSelect');
            const limit = limitSelect.value === '9999999' ? null : parseInt(limitSelect.value);
            loadTableData(currentTable, limit || 100);
            loadTableStructure(currentTable);
        }
    });

    // 搜索表
    document.getElementById('tableSearchInput').addEventListener('input', (e) => {
        tableSearchQuery = e.target.value;
        renderTableList();
    });

    // 行数限制选择
    document.getElementById('limitSelect').addEventListener('change', (e) => {
        const limit = e.target.value === '9999999' ? null : parseInt(e.target.value);
        if (currentTable) {
            loadTableData(currentTable, limit);
        }
    });

    // 添加行
    document.getElementById('addRowBtn').addEventListener('click', showAddRowDialog);

    // 模态框
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSave').addEventListener('click', saveRowData);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// 处理文件选择
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        loadDatabase(file);
    }
}

// 处理拖拽
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.db') || file.name.endsWith('.sqlite') || file.name.endsWith('.sqlite3')) {
            loadDatabase(file);
        } else {
            showToast('请选择 .db, .sqlite 或 .sqlite3 格式的文件', 'error');
        }
    }
}

// 加载数据库
async function loadDatabase(file) {
    showLoading(true);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        db = new SQL.Database(uint8Array);

        // 更新界面
        document.getElementById('dbNameHeader').textContent = file.name;
        document.getElementById('welcomeScreen').style.display = 'none';
        document.getElementById('sidebar').style.display = 'flex';
        document.getElementById('tableView').style.display = 'block';
        document.getElementById('exportDbBtn').style.display = 'flex';
        document.getElementById('openFileLabel').style.display = 'flex';

        refreshTables();
        showToast('数据库加载成功', 'success');
    } catch (error) {
        console.error('加载数据库失败:', error);
        showError('加载数据库失败: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// 刷新表列表
function refreshTables() {
    if (!db) return;

    try {
        allTables = getTables().map(name => ({
            name,
            rowCount: getRowCount(name)
        }));
        renderTableList();
    } catch (error) {
        console.error('刷新表列表失败:', error);
        showError('刷新表列表失败: ' + error.message);
    }
}

// 渲染表列表
function renderTableList() {
    const tableList = document.getElementById('tableList');
    tableList.innerHTML = '';

    const filteredTables = allTables.filter(t => 
        t.name.toLowerCase().includes(tableSearchQuery.toLowerCase())
    );

    if (filteredTables.length === 0) {
        tableList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
                <i class="fas fa-table w-12 h-12 text-gray-300 mb-3"></i>
                <p class="text-xs text-gray-500 font-medium">
                    ${allTables.length > 0 ? '未找到匹配的表' : '尚未加载表'}
                </p>
            </div>
        `;
        return;
    }

    filteredTables.forEach(table => {
        const isActive = currentTable === table.name;
        const button = document.createElement('button');
        button.className = `w-full text-left px-3 py-2.5 rounded-md flex items-center justify-between transition group ${
            isActive 
                ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-blue-600' 
                : 'text-gray-600 hover:bg-white hover:shadow-sm'
        }`;
        button.innerHTML = `
            <div class="flex items-center overflow-hidden">
                <i class="fas fa-table w-4 h-4 mr-2 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}"></i>
                <span class="truncate">${escapeHtml(table.name)}</span>
            </div>
            <span class="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full group-hover:bg-gray-300 transition-colors">
                ${table.rowCount}
            </span>
        `;
        button.addEventListener('click', () => selectTable(table.name));
        tableList.appendChild(button);
    });
}

// 获取所有表
function getTables() {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    if (result.length === 0) return [];
    return result[0].values.map(row => row[0]);
}

// 获取表的行数
function getRowCount(tableName) {
    try {
        const result = db.exec(`SELECT COUNT(*) as count FROM ${escapeTableName(tableName)}`);
        if (result.length === 0) return 0;
        return result[0].values[0][0];
    } catch (error) {
        return 0;
    }
}

// 选择表
function selectTable(tableName) {
    currentTable = tableName;
    document.getElementById('currentTableName').innerHTML = `
        ${escapeHtml(tableName)}
        <button id="refreshTableBtn" class="ml-2.5 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition" title="刷新">
            <i class="fas fa-sync-alt w-4 h-4"></i>
        </button>
    `;
    document.getElementById('refreshTableBtn').addEventListener('click', () => {
        loadTableData(currentTable);
        loadTableStructure(currentTable);
    });

    // 加载表结构和数据
    loadTableStructure(tableName);
    // 默认加载100行
    const limitSelect = document.getElementById('limitSelect');
    limitSelect.value = '100';
    loadTableData(tableName, 100);

    // 切换到数据标签页
    switchTab('data');
    
    // 重新渲染表列表以更新选中状态
    renderTableList();
}

// 加载表结构
function loadTableStructure(tableName) {
    if (!db) return;

    try {
        const result = db.exec(`PRAGMA table_info(${escapeTableName(tableName)})`);
        if (result.length === 0) {
            return;
        }

        const columns = result[0];
        const structureBody = document.getElementById('structureBody');
        structureBody.innerHTML = '';

        columns.values.forEach(row => {
            const [cid, name, type, notNull, defaultValue, pk] = row;
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition';
            tr.innerHTML = `
                <td class="px-8 py-4.5 font-bold text-gray-900">${escapeHtml(name)}</td>
                <td class="px-8 py-4.5 text-gray-600 font-medium uppercase text-xs tracking-wider">${escapeHtml(type)}</td>
                <td class="px-8 py-4.5 text-center">
                    ${notNull ? '<i class="fas fa-check-circle w-5 h-5 text-emerald-500 mx-auto"></i>' : '<i class="fas fa-times w-5 h-5 text-gray-200 mx-auto"></i>'}
                </td>
                <td class="px-8 py-4.5 text-gray-500 font-medium">${defaultValue !== null ? escapeHtml(String(defaultValue)) : 'None'}</td>
                <td class="px-8 py-4.5 text-center">
                    ${pk ? '<span class="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-[10px] font-black tracking-widest uppercase">是</span>' : '<span class="text-gray-300 text-xs font-bold tracking-widest">否</span>'}
                </td>
            `;
            structureBody.appendChild(tr);
        });
    } catch (error) {
        console.error('加载表结构失败:', error);
        showError('加载表结构失败: ' + error.message);
    }
}

// 加载表数据
function loadTableData(tableName, limit = 100) {
    if (!db) return;

    try {
        let query = `SELECT * FROM ${escapeTableName(tableName)}`;
        if (limit) {
            query += ` LIMIT ${parseInt(limit)}`;
        }

        const result = db.exec(query);
        const totalRows = getRowCount(tableName);

        currentTableData = [];
        currentTableColumns = [];

        // 获取主键
        const pkResult = db.exec(`PRAGMA table_info(${escapeTableName(tableName)})`);
        currentTablePk = [];
        if (pkResult.length > 0) {
            pkResult[0].values.forEach(row => {
                if (row[5] === 1) {
                    currentTablePk.push(row[1]);
                }
            });
        }

        if (result.length === 0 || result[0].values.length === 0) {
            const tableBody = document.getElementById('dataTableBody');
            tableBody.innerHTML = `
                <tr>
                    <td colspan="100" class="px-6 py-20 text-center">
                        <p class="text-gray-400 font-medium">表当前为空</p>
                    </td>
                </tr>
            `;
            return;
        }

        const data = result[0];
        currentTableColumns = data.columns;

        // 构建表头
        const tableHead = document.getElementById('dataTableHead');
        tableHead.innerHTML = '';
        data.columns.forEach(col => {
            const colInfo = getColumnInfo(tableName, col);
            const th = document.createElement('th');
            th.className = 'px-5 py-4 font-bold text-gray-700 border-r border-gray-100 last:border-0';
            th.innerHTML = `
                <div class="flex items-center">
                    ${escapeHtml(col)}
                    ${colInfo.pk > 0 ? '<span class="ml-2 text-[9px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-md font-black">PK</span>' : ''}
                </div>
                <span class="block text-[10px] text-gray-400 font-medium mt-1 tracking-wider uppercase">${colInfo.type}</span>
            `;
            tableHead.appendChild(th);
        });

        // 构建表体
        const tableBody = document.getElementById('dataTableBody');
        tableBody.innerHTML = '';

        data.values.forEach((row, index) => {
            const rowObj = {};
            data.columns.forEach((col, colIndex) => {
                rowObj[col] = row[colIndex];
            });
            currentTableData.push(rowObj);

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-blue-50/30 transition group cursor-pointer';
            tr.dataset.rowIndex = index;
            tr.title = '双击编辑记录';
            tr.innerHTML = `
                <td class="px-4 py-3.5 text-xs text-gray-300 font-bold text-center select-none">${index + 1}</td>
            `;
            
            row.forEach((cell, colIndex) => {
                const td = document.createElement('td');
                td.className = 'px-5 py-3.5 text-gray-600 border-r border-gray-50 last:border-0 truncate max-w-xs font-medium';
                const value = cell === null ? '<span class="italic text-gray-300 font-normal">NULL</span>' : escapeHtml(String(cell));
                td.innerHTML = value;
                tr.appendChild(td);
            });

            // 操作列
            const actionTd = document.createElement('td');
            actionTd.className = 'px-4 py-3.5 text-center';
            actionTd.innerHTML = `
                <div class="flex items-center justify-center space-x-1 opacity-20 group-hover:opacity-100 transition-opacity">
                    <button 
                        class="edit-row-btn p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                        title="编辑记录"
                    >
                        <i class="fas fa-edit w-4 h-4"></i>
                    </button>
                    <button 
                        class="delete-row-btn p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                        title="删除记录"
                    >
                        <i class="fas fa-trash w-4 h-4"></i>
                    </button>
                </div>
            `;
            
            actionTd.querySelector('.edit-row-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                showEditDialog(rowObj);
            });
            actionTd.querySelector('.delete-row-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteRow(rowObj);
            });
            
            tr.appendChild(actionTd);
            tr.addEventListener('dblclick', () => showEditDialog(rowObj));
            
            // 右键菜单
            tr.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, rowObj);
            });
            
            tableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('加载表数据失败:', error);
        showError('加载表数据失败: ' + error.message);
    }
}

// 获取列信息
function getColumnInfo(tableName, colName) {
    try {
        const result = db.exec(`PRAGMA table_info(${escapeTableName(tableName)})`);
        if (result.length > 0) {
            const col = result[0].values.find(row => row[1] === colName);
            if (col) {
                return {
                    type: col[2],
                    pk: col[5]
                };
            }
        }
    } catch (error) {
        // 忽略错误
    }
    return { type: 'TEXT', pk: 0 };
}

// 切换标签页
function switchTab(tab) {
    const dataTabBtn = document.getElementById('dataTabBtn');
    const structureTabBtn = document.getElementById('structureTabBtn');
    const dataTabContent = document.getElementById('dataTabContent');
    const structureTabContent = document.getElementById('structureTabContent');

    if (tab === 'data') {
        dataTabBtn.className = 'px-5 py-1.5 text-xs font-bold rounded-lg transition bg-white text-gray-900 shadow-sm';
        structureTabBtn.className = 'px-5 py-1.5 text-xs font-bold rounded-lg transition text-gray-500 hover:text-gray-700';
        dataTabContent.style.display = 'block';
        structureTabContent.style.display = 'none';
    } else {
        dataTabBtn.className = 'px-5 py-1.5 text-xs font-bold rounded-lg transition text-gray-500 hover:text-gray-700';
        structureTabBtn.className = 'px-5 py-1.5 text-xs font-bold rounded-lg transition bg-white text-gray-900 shadow-sm';
        dataTabContent.style.display = 'none';
        structureTabContent.style.display = 'block';
    }
}

// 显示添加行对话框
function showAddRowDialog() {
    if (!currentTable) {
        showToast('请先选择一个表', 'warning');
        return;
    }
    showEditDialog(null);
}

// 显示编辑对话框
function showEditDialog(rowData) {
    if (!currentTable) return;

    try {
        // 获取表结构
        const result = db.exec(`PRAGMA table_info(${escapeTableName(currentTable)})`);
        if (result.length === 0) return;

        const columns = result[0];
        const colInfo = {};
        columns.values.forEach(row => {
            const [cid, name, type, notNull, defaultValue, pk] = row;
            colInfo[name] = { type, notNull: notNull === 1, defaultValue, pk: pk === 1 };
        });

        // 设置标题
        const isEdit = rowData !== null;
        document.getElementById('modalTitle').textContent = isEdit ? '修改记录' : '插入新记录';
        const subtitle = document.getElementById('modalSubtitle');
        if (isEdit) {
            subtitle.style.display = 'flex';
        } else {
            subtitle.style.display = 'none';
        }

        // 构建表单
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">';

        currentTableColumns.forEach(colName => {
            const info = colInfo[colName] || {};
            const field = document.createElement('div');
            field.className = 'flex flex-col space-y-2';

            const label = document.createElement('label');
            label.className = 'text-xs font-semibold text-gray-600 flex items-center justify-between';
            label.innerHTML = `
                <span class="flex items-center">
                    ${escapeHtml(colName)}
                    ${info.pk ? '<span class="ml-2 text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-md">PK</span>' : ''}
                </span>
                <span class="text-[9px] text-gray-400 font-medium">${escapeHtml(info.type)}</span>
            `;
            field.appendChild(label);

            const input = document.createElement('input');
            input.type = 'text';
            input.className = `w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all text-sm font-medium ${
                info.pk ? 'bg-blue-50/30 border-blue-100' : 'group-hover:border-gray-300'
            }`;
            input.name = colName;
            input.placeholder = info.notNull ? '必填字段' : 'NULL';
            
            if (rowData && rowData[colName] !== null && rowData[colName] !== undefined) {
                input.value = String(rowData[colName]);
            } else if (info.defaultValue !== null) {
                input.value = String(info.defaultValue);
            }

            field.appendChild(input);

            if (info.notNull && (!input.value || input.value.trim() === '')) {
                const error = document.createElement('span');
                error.className = 'text-[9px] text-red-500 font-black uppercase tracking-tighter';
                error.textContent = '此字段不能为空';
                field.appendChild(error);
            }

            modalBody.querySelector('div').appendChild(field);
        });

        modalBody.innerHTML += '</div>';

        document.getElementById('editModal').style.display = 'flex';
    } catch (error) {
        console.error('显示编辑对话框失败:', error);
        showError('显示编辑对话框失败: ' + error.message);
    }
}

// 保存行数据
function saveRowData() {
    if (!db || !currentTable) return;

    try {
        const formData = {};
        const colInfo = {};

        // 获取表结构信息
        const result = db.exec(`PRAGMA table_info(${escapeTableName(currentTable)})`);
        result[0].values.forEach(row => {
            const [cid, name, type, notNull, defaultValue, pk] = row;
            colInfo[name] = { type, notNull: notNull === 1, pk: pk === 1 };
        });

        // 收集表单数据
        document.querySelectorAll('#modalBody input').forEach(input => {
            const colName = input.name;
            let value = input.value.trim();

            // 验证非空字段
            if (colInfo[colName].notNull && (!value || value.toUpperCase() === 'NULL')) {
                showToast(`列 "${colName}" 不允许为空`, 'error');
                return;
            }

            // 处理 NULL 值
            if (!value || value.toUpperCase() === 'NULL') {
                formData[colName] = null;
            } else {
                // 尝试转换数据类型
                const colType = colInfo[colName].type.toUpperCase();
                if (colType.includes('INT')) {
                    formData[colName] = parseInt(value) || value;
                } else if (colType.includes('REAL') || colType.includes('FLOAT') || colType.includes('DOUBLE')) {
                    formData[colName] = parseFloat(value) || value;
                } else {
                    formData[colName] = value;
                }
            }
        });

        const selectedRow = document.querySelector('#dataTableBody tr[data-row-index]');
        const isEdit = selectedRow !== null && Object.keys(formData).length > 0;
        const oldRowData = isEdit ? currentTableData.find((r, i) => {
            const rowIndex = parseInt(selectedRow.dataset.rowIndex);
            return i === rowIndex;
        }) : null;

        if (isEdit && oldRowData) {
            // 更新行
            if (!currentTablePk || currentTablePk.length === 0) {
                showToast('该表没有主键，无法更新', 'error');
                return;
            }

            // 构建 WHERE 子句
            const whereConditions = currentTablePk.map(pk => `${escapeTableName(pk)} = ?`).join(' AND ');
            const whereValues = currentTablePk.map(pk => oldRowData[pk]);

            // 检查主键是否改变
            let pkChanged = false;
            for (const pk of currentTablePk) {
                if (String(oldRowData[pk]) !== String(formData[pk])) {
                    pkChanged = true;
                    break;
                }
            }

            if (pkChanged) {
                // 主键改变，需要先删除再插入
                const deleteQuery = `DELETE FROM ${escapeTableName(currentTable)} WHERE ${whereConditions}`;
                db.run(deleteQuery, whereValues);
                
                // 插入新行
                const columns = Object.keys(formData).map(k => escapeTableName(k)).join(', ');
                const placeholders = Object.keys(formData).map(() => '?').join(', ');
                const values = Object.values(formData);
                const insertQuery = `INSERT INTO ${escapeTableName(currentTable)} (${columns}) VALUES (${placeholders})`;
                db.run(insertQuery, values);
                
                showToast('行已更新（主键值已更改）', 'success');
            } else {
                // 更新非主键字段
                const updateFields = Object.keys(formData)
                    .filter(key => !currentTablePk.includes(key))
                    .map(key => `${escapeTableName(key)} = ?`)
                    .join(', ');
                const updateValues = Object.keys(formData)
                    .filter(key => !currentTablePk.includes(key))
                    .map(key => formData[key]);

                if (updateFields) {
                    const updateQuery = `UPDATE ${escapeTableName(currentTable)} SET ${updateFields} WHERE ${whereConditions}`;
                    const values = [...updateValues, ...whereValues];
                    db.run(updateQuery, values);
                    showToast('行已更新', 'success');
                } else {
                    showToast('没有需要更新的数据', 'warning');
                }
            }
        } else {
            // 插入新行
            const columns = Object.keys(formData).map(k => escapeTableName(k)).join(', ');
            const placeholders = Object.keys(formData).map(() => '?').join(', ');
            const values = Object.values(formData);

            const insertQuery = `INSERT INTO ${escapeTableName(currentTable)} (${columns}) VALUES (${placeholders})`;
            db.run(insertQuery, values);
            showToast('行已添加', 'success');
        }

        closeModal();
        setTimeout(() => {
            const limitSelect = document.getElementById('limitSelect');
            const limit = limitSelect.value === '9999999' ? null : parseInt(limitSelect.value);
            loadTableData(currentTable, limit || 100);
            refreshTables();
        }, 100);
    } catch (error) {
        console.error('保存数据失败:', error);
        showError('保存数据失败: ' + error.message);
    }
}

// 删除行
function deleteRow(rowData) {
    if (!db || !currentTable) {
        showToast('请先选择一个表', 'warning');
        return;
    }

    if (!confirm('确定要删除这条记录吗？\n此操作无法撤销。')) {
        return;
    }

    try {
        if (!currentTablePk || currentTablePk.length === 0) {
            showToast('该表没有主键，无法删除', 'error');
            return;
        }

        const whereConditions = currentTablePk.map(pk => `${escapeTableName(pk)} = ?`).join(' AND ');
        const whereValues = currentTablePk.map(pk => rowData[pk]);

        const deleteQuery = `DELETE FROM ${escapeTableName(currentTable)} WHERE ${whereConditions}`;
        db.run(deleteQuery, whereValues);

        showToast('行已删除', 'success');
        setTimeout(() => {
            loadTableData(currentTable);
            refreshTables();
        }, 100);
    } catch (error) {
        console.error('删除数据失败:', error);
        showError('删除数据失败: ' + error.message);
    }
}

// 显示右键菜单
let contextMenuRowData = null;

function showContextMenu(e, rowData) {
    contextMenuRowData = rowData;
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';

    // 绑定菜单项点击事件
    const editBtn = contextMenu.querySelector('.context-menu-item:first-child');
    const deleteBtn = contextMenu.querySelector('.context-menu-item:last-child');
    
    // 移除旧的事件监听器（通过克隆节点）
    const newEditBtn = editBtn.cloneNode(true);
    const newDeleteBtn = deleteBtn.cloneNode(true);
    editBtn.parentNode.replaceChild(newEditBtn, editBtn);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

    newEditBtn.addEventListener('click', () => {
        hideContextMenu();
        showEditDialog(rowData);
    });

    newDeleteBtn.addEventListener('click', () => {
        hideContextMenu();
        deleteRow(rowData);
    });

    // 点击其他地方关闭菜单
    const hideMenu = (event) => {
        if (!contextMenu.contains(event.target)) {
            hideContextMenu();
            document.removeEventListener('click', hideMenu);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', hideMenu);
    }, 0);
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'none';
    contextMenuRowData = null;
}

// 关闭模态框
function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

// 转义表名和列名（防止 SQL 注入）
function escapeTableName(name) {
    return `"${name.replace(/"/g, '""')}"`;
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 显示加载提示
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// 导出数据库
function exportDatabase() {
    if (!db) {
        showToast('没有打开的数据库', 'warning');
        return;
    }

    try {
        const data = db.export();
        const blob = new Blob([data], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = document.getElementById('dbNameHeader').textContent || 'database.db';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('数据库导出成功', 'success');
    } catch (error) {
        console.error('导出数据库失败:', error);
        showError('导出数据库失败: ' + error.message);
    }
}

// 显示错误
function showError(message) {
    const errorDisplay = document.getElementById('errorDisplay');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorDisplay.style.display = 'flex';
    setTimeout(() => {
        errorDisplay.style.display = 'none';
    }, 5000);
}

// 显示消息提示
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const colors = {
        success: 'bg-emerald-600',
        error: 'bg-red-600',
        warning: 'bg-amber-600',
        info: 'bg-blue-600'
    };
    
    toast.className = `${colors[type] || colors.info} text-white px-6 py-3 rounded-lg shadow-lg mb-4 animate-in fade-in slide-in-from-bottom-4`;
    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}
