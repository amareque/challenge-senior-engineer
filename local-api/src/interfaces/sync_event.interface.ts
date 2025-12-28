export enum SyncEventType {
  CREATE_TODO_LIST = 'create-todo-list',
  UPDATE_TODO_LIST = 'update-todo-list',
  DELETE_TODO_LIST = 'delete-todo-list',
  CREATE_TODO_ITEM = 'create-todo-item',
  UPDATE_TODO_ITEM = 'update-todo-item',
  DELETE_TODO_ITEM = 'delete-todo-item',
}

export interface SyncEvent {
  type: SyncEventType;
  payload: {
    id: number;
    [key: string]: any;
  };
}

