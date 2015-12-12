
"use strict";

var gl,
	background_program,
	billboard_program,
	horizon_coords,
	horizon_colors,
	billboard_coords,
	fov = 60,
	canvas,
	keysPressed = [],
	trans_mat = [],
	rot_mat = [],
	textures = {},
	intensity_loop,
	zombie_coords,
	zombie_to_kill,
	bullet_coords,
	bullet_directions,
	bullet_timeouts,
	btimeout = 900, //number of frames before you get a new bullet
	space_tapped = true,
	spawn_wait,
	time,
	day,
	gun_coords,
	gun_program,
	draw_fire = false,
	score,
	num_bullets,
	zombie_speed;

window.onload = function init(){
	canvas = document.getElementById('gl-canvas');
	score = document.getElementById('score');
	num_bullets = document.getElementById('bullets');

	gl = WebGLUtils.setupWebGL(canvas);
	if(!gl){ alert('WebGL is not supported'); }

	gl.viewport(0, 0, canvas.width, canvas.height);
	gl.clearColor(1.0, 1.0, 1.0, 1.0);

	//initialize shaders
	background_program = initShaders(gl, "vertex-shader-horizon", "fragment-shader-horizon");
	billboard_program = initShaders(gl, "vertex-shader-billboard", "fragment-shader-billboard");
	gun_program = initShaders(gl, "vertex-shader-gun", "fragment-shader-gun");

	//allow for transparent images
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.enable(gl.BLEND);

	//add listeners for key input
	window.addEventListener('keydown', function(event){
		keysPressed[event.keyCode] = true;
	});
	window.addEventListener('keyup', function(event){
		keysPressed[event.keyCode] = false;
		if(event.keyCode == 32){
			space_tapped = true;
			draw_fire = true;
		}
	});

	alert('Welcome to Zombie Rampage!\n'+
		'Controls:\n'+
		'WASD or Arrow Keys: move\n'+
		'Q & E  or  N & M: strafe left & right\n'+
		'Spacebar: fire bullets\n'+
		'P: pause the game\n\n'+
		'Now go kill as many zombies as you can!'
	);

	load_textures(
		['house_1.png', 'house_2.png', 'zombie.png', 'bullet.png', 'gun1.png', 'gun1fire.png', 'tree1.png'],
		['house_1', 'house_2', 'zombie', 'bullet', 'gun', 'gun_fire', 'tree'],
		initGame
	);
}

/**
 *	initializes components of the game that need to be initialized for each player life
 */
function initGame(){
	//initialize game object coordinates
	billboard_coords = genPoints(80);
	zombie_coords = genPoints(5);
	zombie_speed = [];
	for(var i=0; i<zombie_coords.length; i++){
		zombie_speed[i] = genSpeedModifier(0.2);
	}

	zombie_to_kill = [];
	intensity_loop = 0;
	bullet_coords = [];
	bullet_timeouts = [];
	bullet_timeouts = [];
	keysPressed = [];
	spawn_wait = 160;
	time = 0;

	score.innerHTML = '0';
	num_bullets.innerHTML = '20';

	trans_mat = [];
	rot_mat = [];

	gun_coords = genGunCoords();

	render();
}

/**
 *	initializes the coordinates for the horizon triangles and the colors of
 *	each vertex
 *
 *	@param {vec4} sky - the color value to use for the sky
 *	@param {vec4} ground - the color value to use for the ground
 *	@param {vec4} horizon - the color of the horizon
 */
function initHorizon(sky, ground, horizon, intensity){
	horizon_coords = [
		new vec2(-1, 0), new vec2(-1, -1), new vec2(1, -1),
		new vec2(-1, 0), new vec2(1, 0), new vec2(1, -1),
		new vec2(-1, 1), new vec2(-1, 0), new vec2(1, 0),
		new vec2(-1, 1), new vec2(1, 1), new vec2(1, 0)
	];
	var intensity_mat = new mat4(
		intensity, 0.0, 0.0, 0.0,
		0.0, intensity, 0.0, 0.0,
		0.0, 0.0, intensity, 0.0,
		0.0, 0.0, 0.0, 1.0
	);
	var horizon_new = vecMatMult(horizon, intensity_mat);
	var ground_new = vecMatMult(ground, intensity_mat);
	var sky_new = vecMatMult(sky, intensity_mat);
	horizon_colors = [
		horizon_new, ground_new, ground_new,
		horizon_new, horizon_new, ground_new,
		sky_new, horizon_new, horizon_new,
		sky_new, sky_new, horizon_new
	];
}

/**
 *	loads the textures/images from the specified urls
 *
 *	@param {string[]} sources - an array of image urls
 *	@param {string[]} names - an array of names to associate with each respective url
 *	@param {function} callback - a function to call after the textures are loaded
 */
function load_textures(sources, names, callback){
	load_images(sources, function(images){
		for(var i=0; i<images.length; i++){
			var texture = gl.createTexture();
			texture.image = images[i];
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			textures[names[i]] = texture;
		}
		callback();
	});
}

/**
 *	loads an image from the specified source and then calls the callback function
 *
 *	@param {string} source - the url for the image to load
 *	@param {function} callback - the function to call after the image loads
 *	@return {Image} the image that was loaded
 */
function load_image(source, callback){
	var image = new Image();
	image.onload = callback;
	image.src = source;
	return image;
}

/**
 *	loads a series of images and then calls the specified callback function
 *
 *	@param {string[]} sources - the array of url strings for the images to load
 *	@param {function} callback -
 */
function load_images(sources, callback){
	var images = [];
	var numImagesLeft, numImages;
	numImagesLeft = numImages = sources.length;

	for(var i=0; i<numImages; i++){
		images.push(load_image(sources[i], function(){
			--numImagesLeft;
			if(numImagesLeft == 0){
				callback(images);
			}
		}));
	}
}

/**
 *	sets the image with the specified name as the current image
 *
 *	@param {string} name - the name of the image to use
 */
function useTexture(name){
	gl.bindTexture(gl.TEXTURE_2D, textures[name]);
}

/**
 *	creates the vertices for a billboard image at the specified coordinates
 *
 *	@param {Array} position - the array containing the vertices
 *	@param {number} position[0] - the x coordinate
 *	@param {number} position[1] - the y coordinate
 *	@param {number} position[2] - the z coordinate
 *	@returns {Object} the object containing the vertices and texture coordinates for the billboard
 */
function create_billboard(position){
	// the vertices define two triangles on the z=0 plane
	var vertices = [new vec4(-1, -1, 0, 1), new vec4(1, -1, 0, 1), new vec4(-1 , 1, 0, 1), new vec4(1, -1, 0, 1), new vec4(-1, 1, 0, 1), new vec4(1, 1, 0, 1)];
	// we translate the billboard to the position of the object in the world
	var trans = translate(position[0], position[1], position[2]);
	// we shrink it using a scale matrix
	var sc = scalem(0.05, 0.05, 0.05);
	// apply the above transformations to all 6 vertices of our billboard
	for(var i=0; i <6; i++){
		vertices[i] = vecMatMult(vertices[i], sc); // scale
		vertices[i] = vecMatMult(vertices[i], trans); // translate
	}
	// define texture coordinates
	var textureCoords = [new vec2(0, 0), new vec2(1, 0), new vec2(0, 1), new vec2(1, 0), new vec2(0, 1), new vec2(1, 1)];
	// create an empty object
	var ret = {};
	// add properties to object and return
	ret.vertices = vertices ;
	ret.textureCoords = textureCoords ;
	return ret ;
}

//no longer needed
/**
 *	generates a list of the given size, each element is randomly made either 1 or 0
 *
 *	@param {number} size - the number of elements to generate
 *	@param {number} chance - the percent chance (0 <= chance <= 1) that an element is 1
 *	@return {Array} a list of 1s and 0s
 */
function genRandom(size, chance){
	var list = [];
	for(var i=0; i<size; i++){
		if(Math.random() < chance){
			list.push(1);
		}else{
			list.push(0);
		}
	}
	return new Float32Array(list);
}

/**
 *	Generates a specified number of random points on the xz-plane
 *
 *	@param {number} numPoints - the number of points to generate
 *	@returns {Array} the array containing the specified number of vec4's for each randomly generated point
 */
function genPoints(numPoints){
	var points = [];
	for(var i=0; i<numPoints; i++){
		points.push(genPoint());
	}
	return points;
}

/**
 *	generates a random point on the xz-plane
 *
 *	@return {vec4} a randomly generated coordinate
 */
function genPoint(){
	var point = new vec4(
		(Math.random() * 4.0) - 2.0,
		0,
		(Math.random() * 4.0) - 2.0,
		1
	);
	while(point[0] < 0.2 && point[0] > -0.2 && point[2] < 0.2 && point[2] > -0.2){
		point = new vec4(
			(Math.random() * 4.0) - 2.0,
			0,
			(Math.random() * 4.0) - 2.0,
			1
		);
	}
	return point;
}

/**
 *	Creates an array of billboard coordinates and texture coordinates
 *
 *	@param {Array} points - an array of vec4's containing the points for billboards
 *	@returns {Object} an object containing an array of billboard coordinates and texture coordinates
 */
function get_billboard_coords(points){
	var vertices = [];
	var textureCoords = [];
	for(var i=0; i<points.length; i++){
		var current = create_billboard(points[i]);
		vertices = vertices.concat(current.vertices);
		textureCoords = textureCoords.concat(current.textureCoords);
	}
	return {vertices: vertices, textureCoords: textureCoords};
}

/**
 *	multiplies a matrix by a vector
 *
 *	@param {vec4} vec - the vector to multiply
 *	@param {mat4} mat - the matrix to multiply by
 *	@returns {vec4} the vector containing the result of multiplication
 */
function vecMatMult(vec, mat){
	var res = vec4();
	res[0] = mat[0][0] * vec[0] + mat[0][1] * vec[1] + mat[0][2] * vec[2] + mat[0][3] * vec[3];
	res[1] = mat[1][0] * vec[0] + mat[1][1] * vec[1] + mat[1][2] * vec[2] + mat[1][3] * vec[3];
	res[2] = mat[2][0] * vec[0] + mat[2][1] * vec[1] + mat[2][2] * vec[2] + mat[2][3] * vec[3];
	res[3] = mat[3][0] * vec[0] + mat[3][1] * vec[1] + mat[3][2] * vec[2] + mat[3][3] * vec[3];
	return res;
}

/**
 *	constructs translation/rotation matrices for movement based on input keys
 */
function handle_input(){
	trans_mat = new mat4(
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1
	);
	rot_mat = new mat4(
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1
	);
	if(keysPressed[65] || keysPressed[37]){ //left
		rot_mat = rotate(-2, new vec4(0, 1, 0, 0));
	}
	else if(keysPressed[68] || keysPressed[39]){ //right
		rot_mat = rotate(2, new vec4(0, 1, 0, 0));
	}
	if(keysPressed[87] || keysPressed[38]){ //forward
		if(!check_collision_forward()){
			trans_mat[2][3] += 0.004;
		}
	}
	if(keysPressed[83] || keysPressed[40]){ //backwards
		if(!check_collision_backwards()){
			trans_mat[2][3] += -0.004;
		}
	}
	if(keysPressed[69] || keysPressed[77]){ //strafe-left
		if(!check_collision_left()){
			trans_mat[0][3] += -0.004;
		}
	}
	if(keysPressed[81] || keysPressed[78]){ //strafe-right
		if(!check_collision_right()){
			trans_mat[0][3] += 0.004;
		}
	}
	if(keysPressed[32] && space_tapped){ //fire-bullet
		space_tapped = false;
		fire_bullet();
	}
	if(keysPressed[80]){ //paused
		alert('Game Paused\nScore is ' + score.innerHTML);
		keysPressed[80] = false;
	}
}

/**
 *	creates a bullet so that it can be moved
 */
function fire_bullet(){
	if(parseInt(num_bullets.innerHTML) > 0){
		bullet_coords.push(new vec4(0.004, -0.005, 0, 1));
		bullet_directions.push(new vec4(-0.04 + (Math.random() * 0.08), -0.04 * (Math.random() * 0.08), -1, 1));
		bullet_timeouts.push(0);
		num_bullets.innerHTML = parseInt(num_bullets.innerHTML) - 1;
	}
}

/**
 *	moves bullets in their corresponding directions
 *
 *	@param {number} speed - the speed of the bullets
 */
function move_bullets(speed){
	speed = speed / 1000;
	for(var i=0; i<bullet_coords.length; i++){
		bullet_coords[i][0] += bullet_directions[i][0] * speed;
		bullet_coords[i][1] += bullet_directions[i][1] * speed;
		bullet_coords[i][2] += bullet_directions[i][2] * speed;
	}
}

/**
 *	updates bullet age and deletes bullets if they have expired
 */
function updateBulletTimeouts(){
	var new_bullet_coords = [];
	var new_bullet_directions = [];
	var new_bullet_timouts = [];
	for(var i=0; i<bullet_coords.length; i++){
		++bullet_timeouts[i];
		if(bullet_timeouts[i] < btimeout){
			new_bullet_coords.push(bullet_coords[i]);
			new_bullet_directions.push(bullet_directions[i]);
			new_bullet_timouts.push(bullet_timeouts[i]);
		}
	}
	bullet_coords = new_bullet_coords;
	bullet_directions = new_bullet_directions;
	bullet_timeouts = new_bullet_timouts;
}

/**
 *	checks if the bullets have hit any zombies
 */
function check_bullet_collisions(){
	var distance = Math.pow(0.008, 2);
	for(var i=0; i<bullet_coords.length; i++){
		for(var j=0; j<zombie_coords.length; j++){
			if(Math.pow(zombie_coords[j][0]-bullet_coords[i][0], 2)+Math.pow(zombie_coords[j][2]-bullet_coords[i][2], 2) < distance){
				bullet_timeouts[i] = btimeout + 1; //destroy bullet
				zombie_to_kill.push(j); //destroy zombie
				score.innerHTML = parseInt(score.innerHTML) + 1;
				if(Math.random() < 0.3){ num_bullets.innerHTML = parseInt(num_bullets.innerHTML) + 1; }
			}
		}
	}
}

/**
 *	checks if a zombie has collided with the player
 */
function check_zombie_collision(){
	var distance = Math.pow(0.036, 2);
	for(var i=0; i<zombie_coords.length; i++){
		if(Math.pow(zombie_coords[i][0], 2) + Math.pow(zombie_coords[i][2], 2) < distance){
			kill_player();
			return false;
		}
	}
	return true;
}

/**
 *	checks if any billboard images are directly in front of the player
 *
 *	@return {boolean} true if there is a billboard directly in front of the camera
 */
function check_collision_forward(){
	for(var i=0; i<billboard_coords.length; i++){
		if((billboard_coords[i][0] < 0.036) && (billboard_coords[i][0] > -0.036) &&
			(billboard_coords[i][2] < 0) && (billboard_coords[i][2] > -0.036)){

			return true;
		}
	}
	return false;
}

/**
 *	checks if any billboard images are directly behind the player
 *
 *	@return {boolean} true if there is a billboard directly behind the camera
 */
function check_collision_backwards(){
	for(var i=0; i<billboard_coords.length; i++){
		if((billboard_coords[i][0] < 0.036) && (billboard_coords[i][0] > -0.036) &&
			(billboard_coords[i][2] > 0) && (billboard_coords[i][2] < 0.036)){

			return true;
		}
	}
	return false;
}

/**
 *	checks if any billboard images are directly left of the player
 *
 *	@return {boolean} true if there is a billboard directly left of the camera
 */
function check_collision_left(){
	for(var i=0; i<billboard_coords.length; i++){
		if((billboard_coords[i][0] > 0) && (billboard_coords[i][0] < 0.036) &&
			(billboard_coords[i][2] < 0.036) && (billboard_coords[i][2] > -0.036)){

			return true;
		}
	}
	return false;
}

/**
 *	checks if any billboard images are directly right of the player
 *
 *	@return {boolean} true if there is a billboard directly right of the camera
 */
function check_collision_right(){
	for(var i=0; i<billboard_coords.length; i++){
		if((billboard_coords[i][0] < 0) && (billboard_coords[i][0] > -0.036) &&
			(billboard_coords[i][2] < 0.036) && (billboard_coords[i][2] > -0.036)){

			return true;
		}
	}
	return false;
}

/**
 *	moves all points in the game (stored in transform_coords) according to the matrices generated from key input
 *
 *	@param {vec4[][]} transform_coords - an array containing arrays of vec4's to be transformed
 */
function transform_geometry(transform_coords){
	for(var i=0; i<transform_coords.length; i++){
		for(var j=0; j<transform_coords[i].length; j++){
			transform_coords[i][j] = vecMatMult(transform_coords[i][j], trans_mat);
			transform_coords[i][j] = vecMatMult(transform_coords[i][j], rot_mat);
		}
	}
}

/**
 *	rotates all direction vectors in the game (stored in transform_coords)
 *	according to the matrices generated from key input
 *
 *	@param {vec4[][]} transform_coords - an array containing arrays of vec4's to be transformed
 */
function transform_directions(transform_coords){
	for(var i=0; i<transform_coords.length; i++){
		for(var j=0; j<transform_coords[i].length; j++){
			transform_coords[i][j] = vecMatMult(transform_coords[i][j], rot_mat);
		}
	}
}

/**
 *	updates the intensity of the horizon
 *
 *	@return {number} the updated intensity
 */
function updateIntensity(){
	intensity_loop += 0.001;

	var intensity = (Math.cos(intensity_loop) * 0.4) + 0.6;

	if(intensity > 0.08){
		day = true;
	}else{
		day = false;
	}

	return intensity;
}

/**
 *	updates the location of zombie_coords so that zombies move towards the player
 *
 *	@param {number} speed - the speed of the zombies' movements
 */
function moveZombies(speed){
	for(var i=0; i<zombie_coords.length; i++){
		var x = zombie_coords[i][0];
		var z = zombie_coords[i][2];
		var distance = Math.sqrt(x*x + z*z);

		zombie_coords[i][0] += speed * zombie_speed[i] * (-x / distance) / 1000;
		zombie_coords[i][2] += speed * zombie_speed[i] * (-z / distance) / 1000;
	}
}

/**
 *	removes zombies that have been killed
 */
function kill_zombies(){
	var new_zombie_coords = [];
	for(var i=0; i<zombie_coords.length; i++){
		var nokill = true;
		for(var j=0; j<zombie_to_kill.length; j++){
			if(i == zombie_to_kill[j]){
				nokill = false;
				break;
			}
		}
		if(nokill) new_zombie_coords.push(zombie_coords[i]);
	}
	zombie_to_kill = [];
	zombie_coords = new_zombie_coords;
}

/**
 *	performs the actions that occer when the player is killed
 */
function kill_player(){
	alert('You Died\nScore was ' + score.innerHTML);
	initGame();
}

/**
 *	adds a zombie to the game.
 */
function spawn_zombie(){
	if(zombie_coords.length < 100){
		var point = genPoint();
		zombie_coords.push(point);
		zombie_speed.push(genSpeedModifier(0.2));
	}
}

/**
 *	generates and returns a speed modifier
 *
 *	@param {number} amp - the max distance from 1.0 for the random modifier
 *	@return {number} a random number between 1 - amp and 1 + amp
 */
function genSpeedModifier(amp){
	return (Math.random() * 2.0 * amp) + (1.0 - amp);
}

/**
 *	generates coordinates for the gun texture
 */
function genGunCoords(){
	var coords = {
		vertices: [
			new vec4(-1, -1, 0, 1), new vec4(-1, 1, 0, 1), new vec4(1, 1, 0, 1),
			new vec4(-1, -1, 0, 1), new vec4(1, 1, 0, 1), new vec4(1, -1, 0, 1)
		],
		textureCoords: [
			new vec2(0, 0), new vec2(0, 1), new vec2(1, 1),
			new vec2(0, 0), new vec2(1, 1), new vec2(1, 0)
		]
	};
	return coords;
}

/**
 *	Draws the game
 */
function render(){
	++time;

	gl.clear(gl.COLOR_BUFFER_BIT);
	//gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

	var intensity = updateIntensity();

	initHorizon(new vec4(0.0, 1.0, 1.0, 1.0), new vec4(0.0, 1.0, 0.0, 1.0), new vec4(1.0, 1.0, 1.0, 1.0), intensity);
	drawHorizon();

	handle_input();

	if(time % ((day)? spawn_wait : spawn_wait/2) == 0){
		spawn_zombie();
	}

	if(time > 4000){
		time = 0;
		spawn_wait -= 5;
		if(spawn_wait < 100){
			spawn_wait = 100;
		}
	}

	if(time % 160 == 0){
		num_bullets.innerHTML = parseInt(num_bullets.innerHTML) + 1;
	}

	check_bullet_collisions();
	kill_zombies();
	updateBulletTimeouts();

	moveZombies(1.0);
	move_bullets(6.0);

	transform_geometry([billboard_coords, zombie_coords, bullet_coords]);
	transform_directions([bullet_directions]);

	drawBillboards();

	draw_gun();

	if(check_zombie_collision()){
		requestAnimFrame(render);
	}
}

/**
 *	draws the gun in front of all objects
 */
function draw_gun(){
	gl.useProgram(gun_program);
	gl.disable(gl.DEPTH_TEST);

	var bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(gun_coords.vertices), gl.STATIC_DRAW);

	var vPosition = gl.getAttribLocation(gun_program, "vPosition");
	gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vPosition);

	var bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(gun_coords.textureCoords), gl.STATIC_DRAW);

	var vTextureCoord = gl.getAttribLocation(gun_program, "vTextureCoord");
	gl.vertexAttribPointer(vTextureCoord, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vTextureCoord);

	gl.disable(gl.BLEND);

	if(draw_fire){
		useTexture('gun_fire');
		draw_fire = false;
	}else{
		useTexture('gun');
	}
	gl.drawArrays(gl.TRIANGLES, 0, gun_coords.vertices.length);
	gl.enable(gl.DEPTH_TEST);
}

/**
 *	sends data to the GPU for the horizon to be drawn
 */
function drawHorizon(){
	gl.useProgram(background_program);

	var bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(horizon_coords), gl.STATIC_DRAW);

	var vPosition = gl.getAttribLocation(background_program, "vPosition");
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vPosition);

	bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(horizon_colors), gl.STATIC_DRAW);

	var vColor = gl.getAttribLocation(background_program, 'vColor');
	gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vColor);

	gl.disable(gl.DEPTH_TEST);
	gl.drawArrays(gl.TRIANGLES, 0, 12);

	gl.enable(gl.DEPTH_TEST);
}

/**
 *	sends data to the GPU for the billboard images to be drawn
 */
function drawBillboards(){
	gl.useProgram(billboard_program);

	var projection = perspective(fov, canvas.width/canvas.height, 0.001, 100);
	var address = gl.getUniformLocation(billboard_program, 'projection');
	gl.uniformMatrix4fv(address, false, flatten(projection));

	drawBillboard(billboard_coords.slice(0, billboard_coords.length/4), 'house_1');
	drawBillboard(billboard_coords.slice(billboard_coords.length/4, 2 * (billboard_coords.length/4)), 'house_2');
	drawBillboard(billboard_coords.slice(2 * (billboard_coords.length/4), billboard_coords.length), 'tree');

	//draw zombies
	drawBillboard(zombie_coords, 'zombie');

	//draw bullets
	drawBillboard(bullet_coords, 'bullet');
}

/**
 *	draws billboards from the given coordinates
 *
 *	@param {vec4[]} coords - the coordinates for where to draw billboards
 *	@param {string} image - the image to us for the billboards
 */
function drawBillboard(coords, image){
	var x_coords = get_billboard_coords(coords);

	var bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(x_coords.vertices), gl.STATIC_DRAW);

	var vPosition = gl.getAttribLocation(billboard_program, "vPosition");
	gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vPosition);

	bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(x_coords.textureCoords), gl.STATIC_DRAW);

	var vTextureCoord = gl.getAttribLocation(billboard_program, "vTextureCoord");
	gl.vertexAttribPointer(vTextureCoord, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vTextureCoord);

	useTexture(image);
	gl.drawArrays(gl.TRIANGLES, 0, x_coords.vertices.length);
}
