import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TodoList } from '../todo_lists/todo_list.entity';
import { Todo } from '../todos/todo.entity';
import { SyncEvent, SyncEventType } from '../interfaces/sync_event.interface';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly httpClient: AxiosInstance;
  private readonly externalApiUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TodoList)
    private readonly todoListRepository: Repository<TodoList>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
  ) {
    this.externalApiUrl =
      this.configService.get<string>('EXTERNAL_API_URL') ||
      'http://localhost:3001';
    this.httpClient = axios.create({
      baseURL: this.externalApiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async handleSyncEvent(event: SyncEvent): Promise<void> {
    this.logger.log(`Processing sync event: ${event.type}`, event.payload);

    try {
      switch (event.type) {
        case SyncEventType.CREATE_TODO_LIST:
          await this.createTodoList(event.payload);
          break;
        case SyncEventType.UPDATE_TODO_LIST:
          await this.updateTodoList(event.payload);
          break;
        case SyncEventType.DELETE_TODO_LIST:
          await this.deleteTodoList(event.payload);
          break;
        case SyncEventType.CREATE_TODO_ITEM:
          await this.createTodoItem(event.payload);
          break;
        case SyncEventType.UPDATE_TODO_ITEM:
          await this.updateTodoItem(event.payload);
          break;
        case SyncEventType.DELETE_TODO_ITEM:
          await this.deleteTodoItem(event.payload);
          break;
        default:
          this.logger.warn(`Unknown sync event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing sync event ${event.type}:`,
        error.message,
      );
      throw error;
    }
  }

  private async createTodoList(payload: { id: number }): Promise<void> {
    const todoList = await this.todoListRepository.findOne({
      where: { id: payload.id },
      relations: ['todos'],
    });

    if (!todoList) {
      throw new HttpException(
        `TodoList with id ${payload.id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // If already synced, skip
    if (todoList.external_id) {
      this.logger.log(
        `TodoList ${payload.id} already synced with external_id ${todoList.external_id}`,
      );
      return;
    }

    // Prepare the request body - send our local id as source_id
    const requestBody = {
      source_id: todoList.id.toString(),
      name: todoList.name,
      items: (todoList.todos || []).map((todo) => ({
        source_id: todo.id.toString(),
        description: todo.title,
        completed: todo.completed,
      })),
    };

    try {
      const response = await this.httpClient.post('/todolists', requestBody);
      const externalTodoList = response.data;

      // Update local record with external_id (the id from external API)
      todoList.external_id = externalTodoList.id;
      await this.todoListRepository.save(todoList);

      // Update todos with their external_ids
      if (externalTodoList.items && todoList.todos) {
        for (const externalItem of externalTodoList.items) {
          const localTodo = todoList.todos.find(
            (t) => t.id.toString() === externalItem.source_id,
          );
          if (localTodo) {
            localTodo.external_id = externalItem.id;
            await this.todoRepository.save(localTodo);
          }
        }
      }

      this.logger.log(
        `Successfully synced TodoList ${payload.id} with external_id ${externalTodoList.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create TodoList ${payload.id} on external API:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  private async updateTodoList(payload: { id: number }): Promise<void> {
    const todoList = await this.todoListRepository.findOne({
      where: { id: payload.id },
    });

    if (!todoList) {
      throw new HttpException(
        `TodoList with id ${payload.id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // If not synced yet, create it first
    if (!todoList.external_id) {
      this.logger.log(
        `TodoList ${payload.id} not synced yet, creating instead of updating`,
      );
      await this.createTodoList(payload);
      return;
    }

    const requestBody = {
      name: todoList.name,
    };

    try {
      await this.httpClient.patch(
        `/todolists/${todoList.external_id}`,
        requestBody,
      );
      this.logger.log(
        `Successfully updated TodoList ${payload.id} (external_id: ${todoList.external_id})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update TodoList ${payload.id} on external API:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  private async deleteTodoList(payload: { id: number }): Promise<void> {
    const todoList = await this.todoListRepository.findOne({
      where: { id: payload.id },
    });

    if (!todoList) {
      // Already deleted locally, that's fine
      return;
    }

    // If not synced, nothing to delete on external API
    if (!todoList.external_id) {
      this.logger.log(
        `TodoList ${payload.id} was never synced, skipping external deletion`,
      );
      return;
    }

    try {
      await this.httpClient.delete(`/todolists/${todoList.external_id}`);
      this.logger.log(
        `Successfully deleted TodoList ${payload.id} (external_id: ${todoList.external_id})`,
      );
    } catch (error) {
      // If 404, it's already deleted on external API, that's fine
      if (error.response?.status === 404) {
        this.logger.log(
          `TodoList ${payload.id} already deleted on external API`,
        );
        return;
      }
      this.logger.error(
        `Failed to delete TodoList ${payload.id} on external API:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  private async createTodoItem(payload: {
    id: number;
    todoListId?: number;
    [key: string]: any;
  }): Promise<void> {
    const todo = await this.todoRepository.findOne({
      where: { id: payload.id },
      relations: ['todoList'],
    });

    if (!todo || !todo.todoList) {
      throw new HttpException(
        `Todo with id ${payload.id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // If already synced, skip
    if (todo.external_id) {
      this.logger.log(
        `Todo ${payload.id} already synced with external_id ${todo.external_id}`,
      );
      return;
    }

    // If todo list is not synced, we need to sync it first (which will include this todo)
    if (!todo.todoList.external_id) {
      this.logger.log(
        `TodoList ${todo.todoList.id} not synced yet, syncing it first`,
      );
      await this.createTodoList({ id: todo.todoList.id });
      // Re-fetch todo to get updated external_id
      const updatedTodo = await this.todoRepository.findOne({
        where: { id: payload.id },
      });
      if (updatedTodo?.external_id) {
        this.logger.log(
          `Todo ${payload.id} synced as part of TodoList sync`,
        );
        return;
      }
    }

    // External API doesn't support creating individual todo items after list creation
    // Items can only be created when creating the todo list
    // So we log a warning and skip syncing this item
    this.logger.warn(
      `Todo ${payload.id} cannot be synced individually. External API only supports creating items when creating the todo list. The item exists locally but won't be synced to external API.`,
    );
  }

  private async updateTodoItem(payload: {
    id: number;
    todoListId?: number;
    [key: string]: any;
  }): Promise<void> {
    const todo = await this.todoRepository.findOne({
      where: { id: payload.id },
      relations: ['todoList'],
    });

    if (!todo || !todo.todoList) {
      throw new HttpException(
        `Todo with id ${payload.id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    // If not synced yet, create it first
    if (!todo.external_id) {
      this.logger.log(
        `Todo ${payload.id} not synced yet, creating instead of updating`,
      );
      await this.createTodoItem(payload);
      return;
    }

    // Ensure todo list is synced
    if (!todo.todoList.external_id) {
      this.logger.log(
        `TodoList ${todo.todoList.id} not synced yet, syncing it first`,
      );
      await this.createTodoList({ id: todo.todoList.id });
      // Re-fetch todo
      const updatedTodo = await this.todoRepository.findOne({
        where: { id: payload.id },
        relations: ['todoList'],
      });
      if (!updatedTodo || !updatedTodo.external_id) {
        throw new HttpException(
          `Failed to sync Todo ${payload.id}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      todo.external_id = updatedTodo.external_id;
      todo.todoList.external_id = updatedTodo.todoList.external_id;
    }

    const requestBody = {
      description: todo.title,
      completed: todo.completed,
    };

    try {
      await this.httpClient.patch(
        `/todolists/${todo.todoList.external_id}/todoitems/${todo.external_id}`,
        requestBody,
      );
      this.logger.log(
        `Successfully updated Todo ${payload.id} (external_id: ${todo.external_id})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update Todo ${payload.id} on external API:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  private async deleteTodoItem(payload: {
    id: number;
    todoListId?: number;
    [key: string]: any;
  }): Promise<void> {
    const todo = await this.todoRepository.findOne({
      where: { id: payload.id },
      relations: ['todoList'],
    });

    if (!todo) {
      // Already deleted locally, that's fine
      return;
    }

    // If not synced, nothing to delete on external API
    if (!todo.external_id) {
      this.logger.log(
        `Todo ${payload.id} was never synced, skipping external deletion`,
      );
      return;
    }

    // Ensure todo list is synced
    if (!todo.todoList?.external_id) {
      this.logger.log(
        `TodoList ${todo.todoList?.id} not synced, skipping external deletion`,
      );
      return;
    }

    try {
      await this.httpClient.delete(
        `/todolists/${todo.todoList.external_id}/todoitems/${todo.external_id}`,
      );
      this.logger.log(
        `Successfully deleted Todo ${payload.id} (external_id: ${todo.external_id})`,
      );
    } catch (error) {
      // If 404, it's already deleted on external API, that's fine
      if (error.response?.status === 404) {
        this.logger.log(`Todo ${payload.id} already deleted on external API`);
        return;
      }
      this.logger.error(
        `Failed to delete Todo ${payload.id} on external API:`,
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async syncFromExternal(): Promise<void> {
    this.logger.log('Starting sync from external API...');

    try {
      const response = await this.httpClient.get('/todolists');
      const externalTodoLists = response.data;

      this.logger.log(
        `Fetched ${externalTodoLists.length} todo lists from external API`,
      );

      const localTodoLists = await this.todoListRepository.find({
        relations: ['todos'],
      });

      const localTodoListsMap = new Map(
        localTodoLists.map((list) => [list.id, list]),
      );

      const externalTodoListsWithoutSourceId = externalTodoLists.filter(
        (list) => !list.source_id,
      );
      const externalTodoListsWithSourceId = externalTodoLists.filter(
        (list) => list.source_id,
      );

      this.logger.log(
        `Found ${externalTodoListsWithoutSourceId.length} external todo lists without source_id and ${externalTodoListsWithSourceId.length} with source_id`,
      );

      for (const externalTodoList of externalTodoListsWithoutSourceId) {
        this.logger.log(
          `Creating todo list locally from external API (id: ${externalTodoList.id}, name: ${externalTodoList.name})`,
        );

        const newTodoList = this.todoListRepository.create({
          name: externalTodoList.name,
          external_id: externalTodoList.id,
        });
        const savedTodoList = await this.todoListRepository.save(newTodoList);

        if (externalTodoList.items && externalTodoList.items.length > 0) {
          const todosToCreate = externalTodoList.items.map((item) =>
            this.todoRepository.create({
              title: item.description,
              completed: item.completed,
              external_id: item.id,
              todoList: savedTodoList,
            }),
          );

          await this.todoRepository.save(todosToCreate);

          this.logger.log(
            `Created ${todosToCreate.length} todo items for todo list ${savedTodoList.id}`,
          );
        }

        this.logger.log(
          `Successfully created todo list ${savedTodoList.id} from external API`,
        );
      }

      for (const externalTodoList of externalTodoListsWithSourceId) {
        const localId = parseInt(externalTodoList.source_id, 10);
        const localTodoList = localTodoListsMap.get(localId);

          if (!localTodoList) {
          // Assuming the Local to-do list was deleted, delete it from external API as well
          this.logger.log(
            `Local todo list with id ${localId} not found, deleting from external API (external_id: ${externalTodoList.id})`,
          );
          try {
            await this.httpClient.delete(`/todolists/${externalTodoList.id}`);
            this.logger.log(
              `Successfully deleted todo list from external API (external_id: ${externalTodoList.id}, source_id: ${externalTodoList.source_id})`,
            );
          } catch (error) {
              this.logger.error(
                `Failed to delete todo list from external API (external_id: ${externalTodoList.id}):`,
                error.response?.data || error.message,
              );
          }
          continue;
        }

        let todoListNeedsUpdate = false;

        if (localTodoList.name !== externalTodoList.name) {
          this.logger.log(
            `Updating todo list ${localTodoList.id} name: "${localTodoList.name}" -> "${externalTodoList.name}"`,
          );
          localTodoList.name = externalTodoList.name;
          todoListNeedsUpdate = true;
        }

        if (localTodoList.external_id !== externalTodoList.id) {
          this.logger.log(
            `Updating todo list ${localTodoList.id} external_id: "${localTodoList.external_id}" -> "${externalTodoList.id}"`,
          );
          localTodoList.external_id = externalTodoList.id;
          todoListNeedsUpdate = true;
        }

        const externalItems = externalTodoList.items || [];
        const localTodos = localTodoList.todos || [];

        const localTodosByExternalId = new Map(
          localTodos
            .filter((t) => t.external_id)
            .map((t) => [t.external_id, t]),
        );

        for (const externalItem of externalItems) {
          if (!externalItem.id) {
            continue;
          }

          const localTodo = localTodosByExternalId.get(externalItem.id);

          if (!localTodo) {
            this.logger.log(
              `Creating todo item locally from external API (id: ${externalItem.id}, description: ${externalItem.description}) in todo list ${localTodoList.id}`,
            );
            const newTodo = this.todoRepository.create({
              title: externalItem.description,
              completed: externalItem.completed,
              external_id: externalItem.id,
              todoList: localTodoList,
            });
            await this.todoRepository.save(newTodo);
            this.logger.log(
              `Successfully created todo item ${newTodo.id} in todo list ${localTodoList.id}`,
            );
          } else {
            const titleNeedsUpdate = localTodo.title !== externalItem.description;
            const completedNeedsUpdate =
              localTodo.completed !== externalItem.completed;

            if (titleNeedsUpdate || completedNeedsUpdate) {
              this.logger.log(
                `Updating todo item ${localTodo.id} in todo list ${localTodoList.id}: title=${titleNeedsUpdate}, completed=${completedNeedsUpdate}`,
              );
              if (titleNeedsUpdate) {
                localTodo.title = externalItem.description;
              }
              if (completedNeedsUpdate) {
                localTodo.completed = externalItem.completed;
              }
              await this.todoRepository.save(localTodo);
            }
          }
        }

        for (const localTodo of localTodos) {
          if (!localTodo.external_id) {
            continue;
          }

          const existsInExternal = externalItems.some(
            (item) => item.id === localTodo.external_id,
          );

          if (!existsInExternal) {
            this.logger.log(
              `Todo item ${localTodo.id} in todo list ${localTodoList.id} exists locally with external_id ${localTodo.external_id} but not found in external API`,
            );
          }
        }

        if (todoListNeedsUpdate) {
          await this.todoListRepository.save(localTodoList);
          this.logger.log(
            `Successfully updated todo list ${localTodoList.id}`,
          );
        } else {
          this.logger.log(
            `Todo list ${localTodoList.id} is in sync with external API`,
          );
        }
      }

      this.logger.log('Completed sync comparison from external API');
    } catch (error) {
      this.logger.error(
        'Error syncing from external API:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }
}

