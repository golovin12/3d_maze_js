import * as THREE from "three";
import CANNON from 'cannon'
import Experience from "../Experience";
import Environment from "./Environment";
import Floor from "./Floor";
import fireVertexShader from '../shaders/fire/vertex.glsl'
import fireFragmentShader from '../shaders/fire/fragment.glsl'
import ugolFragmentShader from '../shaders/ugol/fragment.glsl'
import ugolVertexShader from '../shaders/ugol/vertex.glsl'

export default class World {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.world = new CANNON.World()
        this.world.gravity.set(0, -10, 0)
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 40;
        this.camera = this.experience.camera.instance
        this.clock = new THREE.Clock()
        this.resources = this.experience.resources
        this.gameStarted = false  // Запущена ли игра - если да - позволяем игроку двигаться

        this.resources.on('ready',()=>{
            this.environment = new Environment()
            this.scene.background = this.environment.resources.items.environmentMapTexture

            // Материалы
            let fire_material = new THREE.ShaderMaterial({
                vertexShader: fireVertexShader,
                fragmentShader: fireFragmentShader,
            })
            fire_material.transparent = true

            let player_material = new THREE.ShaderMaterial({
                vertexShader: ugolVertexShader,
                fragmentShader: ugolFragmentShader,
            });

            this.materials = {
                help_arrow: new THREE.MeshStandardMaterial({color: 0xff0000, metalness: 1}),
                wall: new THREE.MeshStandardMaterial({color: 0x049ef4, metalness: 1}),
                end: fire_material,
                player: player_material,
            };

            // Добавляем игрока
            this.player = new THREE.Object3D();
            var help_arrow = new THREE.Mesh(new THREE.ConeGeometry(thickness / 4, thickness / 2, 16), this.materials.help_arrow)
            var head_mesh = new THREE.Mesh(new THREE.SphereGeometry(thickness / 2, 32, 16), this.materials.player);
            var body_mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness / 6, thickness / 2, thickness * 1.5, 12, 1), this.materials.player);
            this.player.add(head_mesh);
            this.player.add(body_mesh);
            this.player.add(help_arrow);
            help_arrow.position.z = -thickness/2
            help_arrow.position.y = thickness * 1.2;
            help_arrow.rotation.x = -Math.PI/2
            head_mesh.position.y = thickness * 1.2;
            body_mesh.position.y = thickness * 0.3;
            this.scene.add(this.player);

            // Добавляем место конца лабиринта
            this.end = new THREE.Object3D();
            let end_element = new THREE.Mesh(new THREE.SphereGeometry(thickness/2, 32, 16), this.materials.end)
            end_element.rotation.x = Math.PI
            this.end.add(end_element)
            this.scene.add(this.end);

            this.new_map = []

            this.events_move()  // Обработчик нажатия на кнопки движения
            this.fullScreen()  // Добавление возможности разворота на весь экран
            this.mazeGenerate()  // Генерация начального лабиринта
        })
    }

    mazeGenerate(){
        // На время генерации лабиринта блокируем управление и показываем loader
        this.gameStarted = false
        let loader = document.querySelector('.loader')
        loader.classList.add('enabled')
        if (this.scene) {
            // Удаляем старый лабиринт
            while (this.scene.children.find((c) => c.type == "Mesh")) {
                const mesh = this.scene.children.find((c) => c.type == "Mesh");
                this.scene.remove(mesh);
            }
        }
        if (this.world) {
            // Remove every object from world
            while (this.world.bodies.length > 0) {
                this.world.remove(this.world.bodies[0]);
            }
        }
        // Добавляем пол в лабиринт
        this.floor = new Floor()
        // Перемещаем конец лабиринта в конец
        this.end.position.set(-((size / 2) * thickness) + (thickness * 2), 0, -((size / 2) * thickness) + (thickness * 2));
        // Перемещаем игрока в начало лабиринта
        this.player_maze_pozition = {x: size-1, z: size-1}
        this.player.position.x = -((size * thickness) / 2) + (size-1) * thickness
        this.player.position.z = -((size * thickness) / 2) + (size-1) * thickness

        this.playerBody = new CANNON.Body({
              mass: 0, // kg
              shape: new CANNON.Box(new CANNON.Vec3(thickness*0.9,thickness*0.9,thickness*0.9)),
        })
        this.playerBody.position.set(-((size * thickness) / 2) + (size-1) * thickness, 0, -((size * thickness) / 2) + (size-1) * thickness);
        this.world.addBody(this.playerBody)

        // Генерируем лабиринт для выбранного size
        this.bodies = []
        this.new_map = maze_gen(size)
        var latency = 50;
        for (var x = size; x > 0; x -= 1){
            for (var y = 1; y < size + 1; y += 1){
                var delay = ((size - x) * latency) + ((size - y) * latency);
                if (this.new_map[x][y] === 0){
                    // Добавляем стену лабиринта
                    var wall_geometry = new THREE.BoxGeometry(thickness, thickness, thickness, 1, 1, 1);
                    let wall_mesh = new THREE.Mesh(wall_geometry, this.materials.wall);
                    wall_mesh.visible = true;

                    const boxBody = new CANNON.Body({
                          mass: 0, // kg
                          shape: new CANNON.Box(new CANNON.Vec3(1,1,1)),
                    })
                    boxBody.position.set(x * thickness - ((size * thickness) / 2), 0, y * thickness - ((size * thickness) / 2));

                    wall_mesh.position.copy(boxBody.position)
                    wall_mesh.quaternion.copy(boxBody.quaternion)
                    this.world.addBody(boxBody)

                    this.new_map[x][y] = wall_mesh
                    this.scene.add(wall_mesh);
                    this.bodies.push([wall_mesh, boxBody])
                } else {this.new_map[x][y] = false;}
            }
        }
        // Отключаем loader и разрешаем управление персонажем
        setTimeout(() => {loader.classList.remove('enabled'); this.gameStarted = true;}, 1000);
    }

    update() {
        if (this.gameStarted && is_dialog_close) {
            this.world.step(1/60);
            // Copy coordinates from Cannon.js to Three.js
            this.player.position.copy(this.playerBody.position)
            this.player.quaternion.copy(this.playerBody.quaternion)
            this.bodies.forEach((element)=>{
                element[0].position.copy(element[1].position)
                element[0].quaternion.copy(element[1].quaternion)
            })
        }
    }

    fullScreen() {
        // Полноэкранный режим по двойному нажатию на экран
        var elem = document.documentElement;
        window.addEventListener('dblclick', (event) => {
            if (document.fullscreen) {
                document.exitFullscreen();
            } else {
                elem.requestFullscreen();
            }
        });
    }

    events_move() {
        // Движение персонажа. Персонаж может двигаться когда закрыто меню и когда лабиринт сгенерирован
        window.addEventListener("keypress", (event)=> {
            if (this.gameStarted && is_dialog_close) {
                if (event.key == "d") {
                    if (this.new_map[this.player_maze_pozition.x + 1][this.player_maze_pozition.z] === false){
                        this.player_maze_pozition.x += 1
                        this.playerBody.position.x += 1 * thickness
                        this.check_the_end()
                    }
                }
                if (event.key == "a") {
                    if (this.new_map[this.player_maze_pozition.x - 1][this.player_maze_pozition.z] === false){
                        this.player_maze_pozition.x -= 1
                        this.playerBody.position.x -= 1 * thickness
                        this.check_the_end()
                    }
                }
                if (event.key == "s") {
                    if (this.new_map[this.player_maze_pozition.x][this.player_maze_pozition.z + 1] === false){
                        this.player_maze_pozition.z += 1
                        this.playerBody.position.z += 1 * thickness
                        this.check_the_end()
                    }
                }
                if (event.key == "w") {
                    if (this.new_map[this.player_maze_pozition.x][this.player_maze_pozition.z - 1] === false){
                        this.player_maze_pozition.z -= 1
                        this.playerBody.position.z -= 1 * thickness
                        this.check_the_end()
                    }
                }
            }
        })
    }

    check_the_end() {
        if (this.player_maze_pozition.x === 2  && this.player_maze_pozition.z === 2){
            // Если персонаж на финише - показываем меню
            let dialog = document.getElementById('dialog')
            is_dialog_close = false
            dialog.showModal()
            dialog.addEventListener('close', () => {
                // после закрытия меню генерируем лабиринт
                is_dialog_close = true
                this.mazeGenerate()
                this.camera.position.set(0, size*thickness*2, 0)
            });
        }
    }
}

function maze_gen(size) {
    // Генерация лабиринта
    var cN = [[0,0],[0,0],[0,0],[0,0]];
    var cx;
    var cy;
    let map = [];
    var random_direction, int_done = 0;
    for (var x = 1; x <= size; x += 1){
        map[x] = [];
        for (var y = 1; y <= size; y += 1){
            map[x][y] = 0;
        }
    }
    do {
        x= 2 + Math.floor(Math.random() * (size - 1));
        if (x % 2 != 0){
            x -= 1;
        }
        y= 2 + Math.floor(Math.random() * (size - 1));
        if (y % 2 != 0){
            y -= 1;
        }
        if (int_done == 0){
            map[x][y] = 1;
        }
        if (map[x][y] == 1){
            random_direction = Math.floor(Math.random() * 4);
            if (random_direction == 0){
                cN = [[-1,0],[1,0],[0,-1],[0,1]];
            }
            else if (random_direction == 1){
                cN = [[0,1],[0,-1],[1,0],[-1,0]];
            }
            else if (random_direction == 2){
                cN = [[0,-1],[0,1],[-1,0],[1,0]];
            }
            else if (random_direction == 3){
                cN = [[1,0],[-1,0],[0,1],[0,-1]];
            }
            var bln_blocked = 1;
            do{
                bln_blocked += 1;
                for (var int_dir = 0; int_dir <= 3; int_dir += 1){
                    cx = x + cN[int_dir][0] * 2;
                    cy = y + cN[int_dir][1] * 2;
                    if (cx < size && cy < size && cx > 1 && cy > 1){
                        if (map[cx][cy] != 1){
                            map[cx][cy] = 1;
                            map[x][y] = 1;
                            map[x + cN[int_dir][0]][y + cN[int_dir][1]] = 1;
                            x = cx;
                            y = cy;
                            bln_blocked = 0;
                            int_done += 1;
                            int_dir = 4;
                        }
                    }
                }
            } while (bln_blocked == 1)
        }
    } while (int_done + 1 < ((size - 1) * (size - 1)) / 4)
    console.log(map)
    return map;
};
