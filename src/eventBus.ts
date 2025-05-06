import { EventEmitter } from 'node:events';

type EventNames =
    | 'havok:ready'
    | 'multiplayer:avatarProfileCardShow'
    | 'multiplayer:avatarProfileCardHide'
    | 'multiplayer:avatarProfileCardUnmount'
    | 'multiplayer:avatarProfileCardUpdate'
    | 'multiplayer:avatarProfileCardFollowClicked'
    | 'multiplayer:avatarProfileCardUnFollowClicked'
    | 'multiplayer:avatarProfileCardDMClicked'
    | 'multiplayer:avatarProfileCardSync'
    | 'multiplayer:fetchAuthenticatedMultiplayerUsers'
    | 'multiplayer:fetchMultiplayUsers'
    | 'multiplayer:fetchMultiplayMessage'
    | 'avatar:set'
    | 'avatar:capsuleBodyCreated'
    | 'avatar:animationsReady'
    | 'avatar:landing'
    | 'avatar:ready'
    | 'avatarController:set'
    | 'avatarController:ready'
    | 'space:atomDataLoaded'
    | 'space:atom3DObjectsLoaded'
    | 'space:sceneCreated'
    | 'space:cameraCreated'
    | 'space:scenePhysicsEnabled'
    | 'space:webXRChecked'
    | 'space:webXRHelperReady'
    | 'space:init'
    | 'space:objectsLoaded'
    | 'space:physicsReady'
    | 'space:envMapReady'
    | 'space:themeLoaded'
    | 'space:noTextureLoaded'
    | 'space:veryLowLoaded'
    | 'space:lowLoaded'
    | 'space:mediumLoaded'
    | 'space:highLoaded'
    | 'space:ultraLoaded'
    | 'space:allLODsLoaded';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Extra = any;
export type SpaceEvent = {
    postId: string;
    atomData?: Extra;
    atom3DObjects?: Extra;
    scene?: Extra;
    camera?: Extra;
    physics?: Extra;
    webXRChecked?: Extra;
    webXRHelper?: Extra;
    theme?: Extra;
    texture?: Extra;
    studioRoom?: Extra;
}

// TODO: update this to use EventTarget instead of EventEmitter
// eslint-disable-next-line unicorn/prefer-event-target
class EventBus extends EventEmitter {
    /**
     * Emit an event with delegation mechanism.
     *
     * First emit triggers a specific event (e.g., "space:loaded") so that listeners explicitly subscribed to that event get notified.
     *
     * Second emit triggers a more general category event (e.g., "space") so that listeners subscribed to all "model:*" events also receive it.
     * @param event Event name (e.g. 'user:login', 'space:created')
     * @param data Data to pass to the listeners
     */
    emitWithEvent<T>(event: EventNames, data: T) {
        // Emit the specific event
        this.emit(event, data);

        // Emit a general category event (delegation mechanism)
        const [category] = event.split(':');
        if (category !== event) {
            this.emit(category, { event, ...data });
        }
    }
    onWithEvent<T>(event: EventNames, listener: (data: T) => void) {
        this.on(event, listener);
    }
    onceWithEvent<T>(event: EventNames, listener: (data: T) => void) {
        this.once(event, listener);
    }
    onceWithEventCheckPostId<T>(id: string, event: EventNames, listener: (data: T) => void) {
        this.on(event, (data: SpaceEvent) => {
            if (data.postId === id) {
                listener(data as T);
                this.off(event, listener);
            }
        });
    }
    offWithEvent<T>(event: EventNames, listener: (data: T) => void) {
        this.off(event, listener);
    }
    offAllDelegated(event: EventNames) {
        this.removeAllListeners(event);
    }
}

// Create a shared instance
const eventBus = new EventBus();
export default eventBus;
